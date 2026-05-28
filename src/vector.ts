// Vector embedding service - simple interface with automatic chunking
import { v4 as uuidv4 } from 'uuid';
import type {
  VectorDocument,
  VectorConfig,
  RuntimeEmbeddingConfig,
  RuntimeStoreConfig,
  SearchOptions,
  SearchResult,
  EmbeddingProvider,
  VectorStoreProvider,
  CollectionConfig,
  EmbedOptions,
} from './types';
import { VectorEmbeddingError, VectorStoreError } from './types';
import { OpenAIEmbeddingProvider } from './providers/embeddings/openai';
import { QdrantVectorStoreProvider } from './providers/stores/qdrant';
import { InMemoryVectorStoreProvider } from './providers/stores/memory';
import { SQLiteVectorStoreProvider } from './providers/stores/sqlite';
import { chunking } from './chunking';

export class Vector {
  private embeddingProvider: EmbeddingProvider;
  private vectorStoreProvider: VectorStoreProvider;

  // Chunking configuration
  private defaultChunkSize: number;
  private defaultChunkStrategy: 'fixed' | 'recursive' | 'semantic' | 'sentence' | 'paragraph';
  private defaultChunkOverlap: number;
  private autoChunk: boolean;

  constructor(config?: VectorConfig) {
    // Initialize providers
    this.embeddingProvider = this.resolveEmbeddingProvider(config);
    this.vectorStoreProvider = this.resolveVectorStoreProvider(config);

    // Initialize chunking defaults
    this.defaultChunkSize = config?.defaultChunkSize ?? 1000;
    this.defaultChunkStrategy = config?.defaultChunkStrategy ?? 'recursive';
    this.defaultChunkOverlap = config?.defaultChunkOverlap ?? 200;
    this.autoChunk = config?.autoChunk ?? true;
  }

  /**
   * Embed text into a collection - automatically chunks if needed
   * If documentId already exists, it will be overwritten (all old chunks deleted first)
   * @returns Document ID and chunk IDs
   */
  async embed(
    collection: string,
    text: string,
    options?: EmbedOptions
  ): Promise<{ documentId: string; chunkIds: string[] }> {
    this.validateCollectionName(collection);
    this.validateText(text);

    const documentId = options?.documentId || uuidv4();
    const shouldChunk = options?.autoChunk ?? this.autoChunk;
    const chunkSize = options?.chunkSize ?? this.defaultChunkSize;

    // Ensure collection exists
    const dimension = this.embeddingProvider.getDimension();
    await this.vectorStoreProvider.ensureCollection(collection, dimension);

    try {
      // If documentId was provided, delete any existing chunks first
      // This prevents orphaned chunks when re-embedding with different chunk counts
      if (options?.documentId) {
        try {
          await this.delete(collection, documentId);
        } catch {
          // Ignore errors if document doesn't exist
        }
      }
      // Determine if chunking is needed based on token count
      // Get token limit from embedding provider to ensure we don't exceed it
      const tokenLimit = this.embeddingProvider.getTokenLimit();
      const actualChunkSize = Math.min(chunkSize, tokenLimit); // Ensure chunk size doesn't exceed model limit

      // Import token counter
      const { countTokens } = await import('./chunking/utils/tokenizer');
      const textTokens = countTokens(text);
      const needsChunking = shouldChunk && textTokens > actualChunkSize;

      if (needsChunking) {
        // Chunk the document using token-based limits
        const chunkOptions: any = {
          strategy: options?.chunkStrategy ?? this.defaultChunkStrategy,
          maxChunkSize: actualChunkSize, // Token limit, not character limit
          overlap: options?.chunkOverlap ?? this.defaultChunkOverlap,
          metadata: options?.metadata,
          tokenLimit, // Pass token limit to strategies
        };

        // For semantic chunking, pass the embedding provider
        if (chunkOptions.strategy === 'semantic') {
          chunkOptions.embeddingProvider = this.embeddingProvider;
        }

        const chunkResult = chunking.chunkDocument(text, chunkOptions, documentId);

        // Prepare documents for batch embedding with chunk IDs in format: documentId#chunkIndex
        const createdAt = Date.now();
        const documents: VectorDocument[] = chunkResult.chunks.map(chunk => {
          const chunkId = `${documentId}#${chunk.metadata.chunkIndex}`;

          // Separate system metadata from user metadata
          const systemMetadata = {
            documentId: chunk.metadata.documentId,
            chunkIndex: chunk.metadata.chunkIndex,
            totalChunks: chunk.metadata.totalChunks,
            startChar: chunk.metadata.startChar,
            endChar: chunk.metadata.endChar,
            createdAt,
            _isChunk: true,
            _documentId: documentId,
            _chunkId: chunkId,
            // Include semantic chunking system metadata if present
            ...(chunk.metadata.header && { header: chunk.metadata.header }),
            ...(chunk.metadata.dependsOn && { dependsOn: chunk.metadata.dependsOn }),
            ...(chunk.metadata.topicVolatility && { topicVolatility: chunk.metadata.topicVolatility }),
            ...(chunk.metadata.roles && { roles: chunk.metadata.roles }),
          };

          return {
            id: chunkId,
            text: chunk.text,
            metadata: {
              system: systemMetadata,
              metadata: options?.metadata || {},
            },
          };
        });

        // Embed all chunks
        const chunkIds = await this.embedBatch(collection, documents, options?.user_id);

        return { documentId, chunkIds };
      } else {
        // Single document, no chunking needed
        // Verify it doesn't exceed token limit
        const textTokens = countTokens(text);
        const tokenLimit = this.embeddingProvider.getTokenLimit();

        if (textTokens > tokenLimit) {
          // Force chunking even if autoChunk is false when document exceeds limit
          throw new VectorEmbeddingError(
            `Document exceeds token limit (${textTokens} > ${tokenLimit}). ` +
            `Enable chunking or reduce document size.`
          );
        }

        const vector = await this.embeddingProvider.embed(text);
        const createdAt = Date.now();

        await this.vectorStoreProvider.upsert(collection, [
          {
            id: documentId,
            vector,
            payload: {
              text,
              system: {
                _documentId: documentId,
                _isChunk: false,
                createdAt,
              },
              metadata: options?.metadata || {},
            },
          },
        ]);

        return { documentId, chunkIds: [documentId] };
      }
    } catch (error) {
      throw new VectorEmbeddingError(
        `Failed to embed document: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Embed multiple documents in batch
   */
  async embedBatch(collection: string, documents: VectorDocument[], user_id?: string): Promise<string[]> {
    this.validateCollectionName(collection);

    if (documents.length === 0) {
      return [];
    }

    try {
      // Ensure collection exists
      const dimension = this.embeddingProvider.getDimension();
      await this.vectorStoreProvider.ensureCollection(collection, dimension);

      // Validate and re-chunk documents that exceed token limit
      const tokenLimit = this.embeddingProvider.getTokenLimit();
      const { countTokens } = await import('./chunking/utils/tokenizer');
      const { chunking } = await import('./chunking');

      const validDocuments: VectorDocument[] = [];
      const texts: string[] = [];

      for (const doc of documents) {
        this.validateText(doc.text);
        const tokenCount = countTokens(doc.text);

        if (tokenCount > tokenLimit) {
          // Re-chunk this document using recursive strategy
          console.warn(
            `Document ${doc.id} exceeds token limit (${tokenCount} > ${tokenLimit}). ` +
            `Automatically re-chunking to preserve data.`
          );

          // Extract parent document ID and chunk index from the chunk ID
          // Format: documentId#chunkIndex
          const parentDocId = doc.id.split('#')[0];
          const parentChunkIndex = doc.id.includes('#') ? parseInt(doc.id.split('#')[1]) : undefined;

          // Re-chunk with a smaller size (use 80% of token limit for safety)
          const safeChunkSize = Math.floor(tokenLimit * 0.8);
          const chunkOptions = {
            strategy: 'recursive' as const,
            maxChunkSize: safeChunkSize,
            overlap: Math.floor(safeChunkSize * 0.1), // 10% overlap
            tokenLimit,
          };
          const chunkResult = chunking.chunkDocument(doc.text, chunkOptions, parentDocId);

          // Create sub-chunks with proper IDs
          for (let i = 0; i < chunkResult.chunks.length; i++) {
            const subChunk = chunkResult.chunks[i];
            // Create sub-chunk ID: parentChunkId#subIndex
            const subChunkId = parentChunkIndex !== undefined
              ? `${parentDocId}#${parentChunkIndex}.${i}`
              : `${doc.id}.${i}`;

            validDocuments.push({
              id: subChunkId,
              text: subChunk.text,
              metadata: {
                ...doc.metadata,
                system: {
                  ...(doc.metadata?.system || {}),
                  _isSubChunk: true,
                  _parentChunkId: doc.id,
                  _subChunkIndex: i,
                  _totalSubChunks: chunkResult.chunks.length,
                },
              },
            });
            texts.push(subChunk.text);
          }
        } else {
          validDocuments.push(doc);
          texts.push(doc.text);
        }
      }

      if (texts.length === 0) {
        throw new VectorEmbeddingError('All documents exceeded token limit and could not be re-chunked');
      }

      // Generate embeddings in batch
      const vectors = await this.embeddingProvider.embedBatch(texts);

      // Prepare points for upsert.
      // Keep one payload schema across embed() and embedBatch():
      // - system fields in payload.system
      // - caller metadata in payload.metadata
      const points = validDocuments.map((doc, index) => {
        const rawMetadata = doc.metadata || {};
        const rawSystem =
          rawMetadata.system && typeof rawMetadata.system === 'object'
            ? (rawMetadata.system as Record<string, any>)
            : undefined;
        const nestedMetadata =
          rawMetadata.metadata && typeof rawMetadata.metadata === 'object'
            ? (rawMetadata.metadata as Record<string, any>)
            : undefined;
        const extraMetadata = Object.fromEntries(
          Object.entries(rawMetadata).filter(([key]) => key !== 'system' && key !== 'metadata')
        );

        return {
          id: doc.id || uuidv4(),
          vector: vectors[index],
          payload: {
            text: doc.text,
            ...(rawSystem ? { system: rawSystem } : {}),
            metadata: {
              ...(nestedMetadata || {}),
              ...extraMetadata,
            },
          },
        };
      });

      // Store in vector database
      await this.vectorStoreProvider.upsert(collection, points);

      // Usage tracking can be handled by host applications.
      void user_id;

      return points.map(p => p.id);
    } catch (error) {
      throw new VectorEmbeddingError(
        `Failed to embed batch: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Search for similar documents
   */
  async search(collection: string, query: string, options?: SearchOptions): Promise<SearchResult[]> {
    this.validateCollectionName(collection);
    this.validateText(query);

    try {
      // Generate query embedding
      const vector = await this.embeddingProvider.embed(query);

      // Search in vector database
      await this.ensureCollection(collection);
      const rawResults = await this.vectorStoreProvider.search(collection, vector, options ?? {});

      // Separate system metadata from user metadata and extract createdAt
      const includeSystem = options?.includeSystem ?? false;

      return rawResults.map(result => {
        const payload = result.metadata || {};
        const system = payload.system || {};

        // Convert timestamp to ISO string
        const timestamp = system.createdAt || Date.now();
        const createdAt = new Date(timestamp).toISOString();

        const searchResult: SearchResult = {
          id: result.id,
          text: result.text,
          score: result.score,
          createdAt, // ISO 8601 datetime string
          metadata: payload.metadata || {},
        };

        // Only include system metadata if explicitly requested
        if (includeSystem) {
          searchResult.system = system;
        }

        return searchResult;
      });
    } catch (error) {
      throw new VectorEmbeddingError(
        `Failed to search: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
        { query, options }
      );
    }
  }

  /**
   * Update or insert a document (handles all chunks automatically)
   */
  async upsert(collection: string, documentId: string, text: string, options?: EmbedOptions): Promise<void> {
    this.validateCollectionName(collection);
    this.validateText(text);

    try {
      // Delete existing document and all its chunks
      await this.delete(collection, documentId);

      // Re-embed with same document ID
      await this.embed(collection, text, { ...options, documentId });
    } catch (error) {
      throw new VectorEmbeddingError(
        `Failed to upsert document: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Delete a document and all its chunks
   * Uses metadata filtering to find and delete all chunks efficiently
   */
  async delete(collection: string, documentId: string | string[]): Promise<void> {
    this.validateCollectionName(collection);

    const documentIds = Array.isArray(documentId) ? documentId : [documentId];

    if (documentIds.length === 0) {
      return;
    }

    try {
      const allIds: string[] = [];

      for (const docId of documentIds) {
        // Add the document ID itself (for non-chunked docs)
        allIds.push(docId);

        // Query for all chunks with this documentId using metadata filter
        // Chunks have system._documentId metadata set to the parent document ID
        const chunkIds = await this.vectorStoreProvider.getIdsByFilter(
          collection,
          { 'system._documentId': docId }
        );

        allIds.push(...chunkIds);
      }

      // Delete all IDs (only actual existing ones)
      if (allIds.length > 0) {
        await this.vectorStoreProvider.delete(collection, allIds);
      }
    } catch (error) {
      throw new VectorStoreError(
        `Failed to delete document(s): ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Delete an entire collection
   */
  async deleteCollection(collection: string): Promise<void> {
    this.validateCollectionName(collection);

    try {
      await this.vectorStoreProvider.deleteCollection(collection);
    } catch (error) {
      throw new VectorStoreError(
        `Failed to delete collection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Ensure a collection exists with optional custom configuration
   */
  async ensureCollection(collection: string, config?: CollectionConfig): Promise<void> {
    this.validateCollectionName(collection);

    try {
      const dimension = config?.dimension ?? this.embeddingProvider.getDimension();
      await this.vectorStoreProvider.ensureCollection(collection, dimension, config);
    } catch (error) {
      throw new VectorStoreError(
        `Failed to ensure collection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get the current embedding provider
   */
  getEmbeddingProvider(): EmbeddingProvider {
    return this.embeddingProvider;
  }

  /**
   * Get the current vector store provider
   */
  getVectorStoreProvider(): VectorStoreProvider {
    return this.vectorStoreProvider;
  }

  /**
   * Generate chunk ID from document ID and chunk index
   */
  static getChunkId(documentId: string, chunkIndex: number): string {
    return `${documentId}#${chunkIndex}`;
  }

  /**
   * Parse chunk ID to extract document ID and chunk index
   */
  static parseChunkId(chunkId: string): { documentId: string; chunkIndex: number } | null {
    const parts = chunkId.split('#');
    if (parts.length !== 2) {
      return null;
    }

    const chunkIndex = parseInt(parts[1], 10);
    if (isNaN(chunkIndex)) {
      return null;
    }

    return {
      documentId: parts[0],
      chunkIndex,
    };
  }

  /**
   * Check if an ID is a chunk ID (contains #)
   */
  static isChunkId(id: string): boolean {
    return id.includes('#');
  }

  // Private methods

  private resolveEmbeddingProvider(config?: VectorConfig): EmbeddingProvider {
    if (config?.embeddingProvider) {
      return config.embeddingProvider;
    }

    const embedding = config?.embedding;
    if (!embedding) {
      throw new VectorEmbeddingError(
        'No embedding provider configured. Pass `embedding` or `embeddingProvider`.'
      );
    }

    return this.createEmbeddingProviderFromRuntime(embedding);
  }

  private resolveVectorStoreProvider(config?: VectorConfig): VectorStoreProvider {
    if (config?.vectorStoreProvider) {
      return config.vectorStoreProvider;
    }

    const store = config?.store;
    if (!store) {
      return new SQLiteVectorStoreProvider({
        path: './vector.db',
        inMemory: false,
      });
    }

    return this.createVectorStoreProviderFromRuntime(store);
  }

  private createEmbeddingProviderFromRuntime(config: RuntimeEmbeddingConfig): EmbeddingProvider {
    if (config.type === 'custom') {
      return config.provider;
    }

    return new OpenAIEmbeddingProvider({
      apiKey: config.apiKey,
      model: config.model || 'text-embedding-3-small',
      dimension: config.dimension,
      maxRetries: config.maxRetries,
    });
  }

  private createVectorStoreProviderFromRuntime(config: RuntimeStoreConfig): VectorStoreProvider {
    switch (config.type) {
      case 'sqlite': {
        const sqlitePath = config.path || './vector.db';
        return new SQLiteVectorStoreProvider({
          path: sqlitePath,
          inMemory: sqlitePath === ':memory:',
        });
      }

      case 'qdrant':
        return new QdrantVectorStoreProvider({
          url: config.url,
          apiKey: config.apiKey,
          port: config.port,
          timeout: config.timeout,
          checkCompatibility: config.checkCompatibility,
        });

      case 'memory':
        return new InMemoryVectorStoreProvider();

      case 'custom':
        return config.provider;
    }
  }

  private validateCollectionName(name: string): void {
    if (!name || typeof name !== 'string') {
      throw new VectorStoreError('Collection name must be a non-empty string');
    }

    // Collection names should be alphanumeric with underscores and hyphens
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new VectorStoreError(
        'Collection name must contain only alphanumeric characters, underscores, and hyphens'
      );
    }
  }

  private validateText(text: string): void {
    if (!text || typeof text !== 'string') {
      throw new VectorEmbeddingError('Text must be a non-empty string');
    }

    if (text.trim().length === 0) {
      throw new VectorEmbeddingError('Text cannot be empty or only whitespace');
    }
  }
}
