// Vector embedding service types

export interface VectorDocument {
  id: string;
  text: string;
  metadata?: Record<string, any>;
}

export interface VectorPoint {
  id: string;
  vector: number[];
  payload?: Record<string, any>;
}

export interface EmbedOptions {
  documentId?: string; // Track multiple chunks under one document
  metadata?: Record<string, any>;
  chunkSize?: number;
  chunkStrategy?: 'fixed' | 'recursive' | 'semantic' | 'sentence' | 'paragraph';
  chunkOverlap?: number;
  autoChunk?: boolean; // Override service default
  user_id?: string; // For usage tracking
}

export interface SearchOptions {
  limit?: number;
  scoreThreshold?: number;
  /**
   * Payload filter. Keys without a dot are applied under `metadata.*` (e.g. `user_id` → `metadata.user_id`).
   * Keys that already contain a dot are used as-is (e.g. `metadata.thread_id`).
   * Scalar values: equality match. Array values: match any element (OR) on that field.
   */
  filter?: Record<string, any>;
  includeSystem?: boolean; // Include system metadata (default: false)
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  createdAt: string;                // ISO 8601 datetime string
  system?: Record<string, any>;     // Internal system metadata (chunk info, etc.)
  metadata?: Record<string, any>;   // User-provided metadata
}

export interface VectorConfig {
  embedding?: RuntimeEmbeddingConfig;
  store?: RuntimeStoreConfig;
  /** @deprecated Prefer `embedding.type = 'custom'` */
  embeddingProvider?: EmbeddingProvider;
  /** @deprecated Prefer `store.type = 'custom'` */
  vectorStoreProvider?: VectorStoreProvider;
  defaultChunkSize?: number;
  defaultChunkStrategy?: 'fixed' | 'recursive' | 'semantic' | 'sentence' | 'paragraph';
  defaultChunkOverlap?: number;
  autoChunk?: boolean; // Automatically chunk large documents
}

export type RuntimeEmbeddingConfig =
  | {
      type: 'openai';
      apiKey: string;
      model?: string;
      dimension?: number;
      maxRetries?: number;
    }
  | {
      type: 'custom';
      provider: EmbeddingProvider;
    };

export type RuntimeStoreConfig =
  | {
      type: 'sqlite';
      path?: string;
      inMemory?: boolean;
    }
  | {
      type: 'qdrant';
      url: string;
      port?: number;
      apiKey?: string;
      timeout?: number;
      checkCompatibility?: boolean;
    }
  | {
      type: 'memory';
    }
  | {
      type: 'custom';
      provider: VectorStoreProvider;
    };

export interface CollectionConfig {
  dimension?: number;
  distance?: 'cosine' | 'euclidean' | 'dot';
}

// Provider interfaces
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  getDimension(): number;
  getModelName(): string;
  getTokenLimit(): number; // Maximum tokens the model can handle
}

export interface VectorStoreProvider {
  ensureCollection(name: string, dimension: number, config?: CollectionConfig): Promise<void>;
  upsert(collection: string, points: VectorPoint[]): Promise<void>;
  search(collection: string, vector: number[], options: SearchOptions): Promise<SearchResult[]>;
  delete(collection: string, ids: string[]): Promise<void>;
  deleteCollection(collection: string): Promise<void>;
  /** Scroll/query for point IDs matching a filter (for efficient chunk cleanup) */
  getIdsByFilter(collection: string, filter: Record<string, any>, limit?: number): Promise<string[]>;
}

// Custom error types
export class VectorEmbeddingError extends Error {
  constructor(message: string, public cause?: Error, public data?: Record<string, any>) {
    super(JSON.stringify({ message, cause, data }, null, 2));
    this.name = 'VectorEmbeddingError';
    this.data = data;
  }
}

export class VectorSearchError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'VectorSearchError';
  }
}

export class VectorStoreError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'VectorStoreError';
  }
}

