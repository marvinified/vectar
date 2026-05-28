// Qdrant vector store provider
import { QdrantClient } from '@qdrant/js-client-rest';
import { v5 as uuidv5 } from 'uuid';
import type { VectorStoreProvider, VectorPoint, SearchOptions, SearchResult, CollectionConfig } from '../../types';
import { VectorStoreError, VectorSearchError } from '../../types';

// UUID namespace for generating deterministic UUIDs from string IDs
const UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // Standard DNS namespace

export interface QdrantConfig {
  url?: string;
  port?: number;
  apiKey?: string;
  timeout?: number;
  checkCompatibility?: boolean;
}

export class QdrantVectorStoreProvider implements VectorStoreProvider {
  private client: QdrantClient;
  private collectionCache = new Set<string>();

  constructor(config: QdrantConfig = {}) {
    const url = config.url || ':memory:';
    this.client = new QdrantClient({
      url,
      port: config.port ?? 6333,
      apiKey: config.apiKey,
      timeout: config.timeout ?? 30000,
      checkCompatibility: config.checkCompatibility ?? false,
    });
  }

  /**
   * Convert a string ID to a valid Qdrant point ID
   * Qdrant accepts valid UUIDs (string format) or uint64 integers
   * Since chunk IDs like "uuid#0" aren't valid UUIDs, we convert them to UUID v5 (deterministic)
   */
  private stringIdToQdrantId(id: string): string {
    // Check if it's already a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(id)) {
      return id; // Already a valid UUID, return as-is
    }

    // Convert non-UUID strings to deterministic UUID v5
    // This ensures the same ID always maps to the same UUID
    return uuidv5(id, UUID_NAMESPACE);
  }

  async ensureCollection(name: string, dimension: number, config?: CollectionConfig): Promise<void> {
    try {
      // Check cache first
      if (this.collectionCache.has(name)) {
        return;
      }

      // Check if collection exists
      try {
        await this.client.getCollection(name);
        this.collectionCache.add(name);
        return;
      } catch {
        // Collection doesn't exist, create it
      }

      // Create collection
      await this.client.createCollection(name, {
        vectors: {
          size: dimension,
          distance: config?.distance === 'euclidean' ? 'Euclid' :
            config?.distance === 'dot' ? 'Dot' : 'Cosine',
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      });

      // Create payload index for metadata filtering
      await this.client.createPayloadIndex(name, {
        field_name: 'text',
        field_schema: 'keyword',
      });

      this.collectionCache.add(name);
    } catch (error) {
      console.error("[_ensureCollection] error", error);
      throw new VectorStoreError(
        `Failed to ensure collection '${name}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async upsert(collection: string, points: VectorPoint[]): Promise<void> {
    try {
      if (points.length === 0) {
        return;
      }

      const qdrantPoints = points.map(point => {
        const qdrantId = this.stringIdToQdrantId(point.id);

        return {
          id: qdrantId,
          vector: point.vector,
          payload: {
            text: point.payload?.text || '',
            _originalId: point.id, // Store original ID for later retrieval
            ...point.payload,
          },
        };
      });

      await this.client.upsert(collection, {
        wait: true,
        points: qdrantPoints,
      });
    } catch (error) {
      throw new VectorStoreError(
        `Failed to upsert points to collection '${collection}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async search(collection: string, vector: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    try {
      const limit = options.limit ?? 10;
      const scoreThreshold = options.scoreThreshold ?? 0.0;

      const searchResult = await this.client.search(collection, {
        vector,
        limit,
        score_threshold: scoreThreshold,
        filter: options.filter ? this.buildFilter(options.filter) : undefined,
        with_payload: true,
      });

      return searchResult.map(result => {
        const payload = result.payload || {};
        const system = (payload.system as Record<string, any>) || {};
        // Use original ID from payload if available, otherwise use Qdrant ID
        const originalId = (payload._originalId as string) || String(result.id);

        // Remove _originalId from metadata before returning
        const { _originalId, ...cleanPayload } = payload;

        return {
          id: originalId,
          text: (payload.text as string) || '',
          score: result.score,
          createdAt: system.createdAt || Date.now(),
          metadata: cleanPayload,
        };
      });
    } catch (error) {
      throw new VectorSearchError(
        `Failed to search in collection '${collection}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async delete(collection: string, ids: string[]): Promise<void> {
    try {
      if (ids.length === 0) {
        return;
      }

      // Convert original IDs to Qdrant IDs for deletion
      const qdrantIds = ids.map(id => this.stringIdToQdrantId(id));

      await this.client.delete(collection, {
        wait: true,
        points: qdrantIds,
      });
    } catch (error) {
      throw new VectorStoreError(
        `Failed to delete points from collection '${collection}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteCollection(collection: string): Promise<void> {
    try {
      await this.client.deleteCollection(collection);
      this.collectionCache.delete(collection);
    } catch (error) {
      throw new VectorStoreError(
        `Failed to delete collection '${collection}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async getIdsByFilter(collection: string, filter: Record<string, any>, limit: number = 10000): Promise<string[]> {
    try {
      const qdrantFilter = this.buildFilter(filter);

      if (!qdrantFilter) {
        return [];
      }

      // Use scroll API to get all matching point IDs with payload
      // We need payload to get the original IDs
      const result = await this.client.scroll(collection, {
        filter: qdrantFilter,
        limit,
        with_payload: true,
        with_vector: false,
      });

      // Return original IDs from payload if available, otherwise Qdrant IDs
      return result.points.map(point => {
        const payload = point.payload || {};
        return (payload._originalId as string) || String(point.id);
      });
    } catch (error) {
      throw new VectorStoreError(
        `Failed to get IDs by filter from collection '${collection}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private buildFilter(filter: Record<string, any>): any {
    const must: any[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (key === 'text') continue; // Skip text field as it's the main content
      if (value === undefined || value === null) continue;

      const parsedKey = key.includes('.') ? key : `metadata.${key}`;

      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        if (value.length === 1) {
          must.push({
            key: parsedKey,
            match: { value: value[0] },
          });
        } else {
          must.push({
            should: value.map((v) => ({
              key: parsedKey,
              match: { value: v },
            })),
          });
        }
      } else {
        must.push({
          key: parsedKey,
          match: { value },
        });
      }
    }

    return must.length > 0 ? { must } : undefined;
  }

  private extractMetadata(payload: Record<string, unknown>): Record<string, any> {
    const { text, ...metadata } = payload;
    return metadata;
  }
}

