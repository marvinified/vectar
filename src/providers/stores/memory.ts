// In-memory vector store provider (for testing/simple use cases)
import type { VectorStoreProvider, VectorPoint, SearchOptions, SearchResult, CollectionConfig } from '../../types';
import { VectorStoreError, VectorSearchError } from '../../types';

interface StoredPoint extends VectorPoint {
  text: string;
}

export class InMemoryVectorStoreProvider implements VectorStoreProvider {
  private collections = new Map<string, Map<string, StoredPoint>>();
  private collectionConfigs = new Map<string, { dimension: number; distance: string }>();

  async ensureCollection(name: string, dimension: number, config?: CollectionConfig): Promise<void> {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
      this.collectionConfigs.set(name, {
        dimension,
        distance: config?.distance ?? 'cosine',
      });
    }
  }

  async upsert(collection: string, points: VectorPoint[]): Promise<void> {
    const store = this.collections.get(collection);
    if (!store) {
      throw new VectorStoreError(`Collection '${collection}' does not exist`);
    }

    for (const point of points) {
      store.set(point.id, {
        ...point,
        text: point.payload?.text || '',
      });
    }
  }

  async search(collection: string, vector: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    try {
      const store = this.collections.get(collection);
      if (!store) {
        throw new VectorSearchError(`Collection '${collection}' does not exist`);
      }

      const config = this.collectionConfigs.get(collection);
      if (!config) {
        throw new VectorSearchError(`Collection config not found for '${collection}'`);
      }

      const limit = options.limit ?? 10;
      const scoreThreshold = options.scoreThreshold ?? 0.0;

      // Calculate similarity for all points
      const results: SearchResult[] = [];

      for (const [id, point] of store.entries()) {
        // Apply filter if provided
        if (options.filter && !this.matchesFilter(point.payload, options.filter)) {
          continue;
        }

        const score = this.calculateSimilarity(vector, point.vector, config.distance);

        if (score >= scoreThreshold) {
          const payload = point.payload || {};
          const system = payload.system || {};

          results.push({
            id,
            text: point.text,
            score,
            createdAt: system.createdAt || Date.now(),
            metadata: payload,
          });
        }
      }

      // Sort by score descending and limit
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, limit);
    } catch (error) {
      throw new VectorSearchError(
        `Failed to search in collection '${collection}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async delete(collection: string, ids: string[]): Promise<void> {
    const store = this.collections.get(collection);
    if (!store) {
      throw new VectorStoreError(`Collection '${collection}' does not exist`);
    }

    for (const id of ids) {
      store.delete(id);
    }
  }

  async deleteCollection(collection: string): Promise<void> {
    this.collections.delete(collection);
    this.collectionConfigs.delete(collection);
  }

  async getIdsByFilter(collection: string, filter: Record<string, any>, limit: number = 10000): Promise<string[]> {
    const store = this.collections.get(collection);
    if (!store) {
      throw new VectorStoreError(`Collection '${collection}' does not exist`);
    }

    const matchingIds: string[] = [];
    let count = 0;

    for (const [id, point] of store.entries()) {
      if (count >= limit) break;

      if (this.matchesFilter(point.payload, filter)) {
        matchingIds.push(id);
        count++;
      }
    }

    return matchingIds;
  }

  private calculateSimilarity(vec1: number[], vec2: number[], distance: string): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vector dimensions do not match');
    }

    switch (distance) {
      case 'cosine':
        return this.cosineSimilarity(vec1, vec2);
      case 'euclidean':
        return 1 / (1 + this.euclideanDistance(vec1, vec2));
      case 'dot':
        return this.dotProduct(vec1, vec2);
      default:
        return this.cosineSimilarity(vec1, vec2);
    }
  }

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (mag1 * mag2);
  }

  private euclideanDistance(vec1: number[], vec2: number[]): number {
    return Math.sqrt(vec1.reduce((sum, val, i) => sum + Math.pow(val - vec2[i], 2), 0));
  }

  private dotProduct(vec1: number[], vec2: number[]): number {
    return vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
  }

  private matchesFilter(payload: Record<string, any> | undefined, filter: Record<string, any>): boolean {
    if (!payload) return false;

    const _filter = this.buildFilter(filter);

    for (const [key, value] of Object.entries(_filter)) {
      const keys = key.split('.');
      let current: any = payload;

      for (const k of keys) {
        if (current && typeof current === 'object' && k in current) {
          current = current[k];
        } else {
          return false;
        }
      }

      if (Array.isArray(value)) {
        if (value.length === 0) {
          continue;
        }
        if (!value.includes(current)) {
          return false;
        }
      } else if (current !== value) {
        return false;
      }
    }

    return true;
  }

  private buildFilter(filter: Record<string, any>): any {
    const _filter: any = {};

    for (const [key, value] of Object.entries(filter)) {
      if (key === 'text') continue; // Skip text field as it's the main content

      const parsedKey = key.includes('.') ? key : `metadata.${key}`;
      _filter[parsedKey] = value;
    }

    return _filter;
  }
}

