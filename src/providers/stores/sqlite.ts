// SQLite vector store provider with cosine similarity search
import BetterSqlite3 from 'better-sqlite3';
import type { VectorStoreProvider, VectorPoint, SearchOptions, SearchResult, CollectionConfig } from '../../types';
import { VectorStoreError, VectorSearchError } from '../../types';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface SQLiteConfig {
  path?: string; // Path to SQLite database file
  inMemory?: boolean; // Use in-memory database
}

export class SQLiteVectorStoreProvider implements VectorStoreProvider {
  private db: BetterSqlite3.Database;
  private collections = new Set<string>();

  constructor(config: SQLiteConfig = {}) {
    const dbPath = config.inMemory ? ':memory:' : (config.path || 'data/vector.db');

    // Ensure directory exists if using file storage
    if (!config.inMemory && dbPath !== ':memory:') {
      const dir = dirname(dbPath);
      if (dir && dir !== '.' && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new BetterSqlite3(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initializeSchema();
  }

  private initializeSchema(): void {
    // Create tables if they don't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        name TEXT PRIMARY KEY,
        dimension INTEGER NOT NULL,
        distance TEXT NOT NULL DEFAULT 'cosine',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS vectors (
        id TEXT NOT NULL,
        collection TEXT NOT NULL,
        vector BLOB NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (collection, id),
        FOREIGN KEY (collection) REFERENCES collections(name) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_vectors_collection ON vectors(collection);
      CREATE INDEX IF NOT EXISTS idx_vectors_id ON vectors(id);
    `);
  }

  async ensureCollection(name: string, dimension: number, config?: CollectionConfig): Promise<void> {
    try {
      if (this.collections.has(name)) {
        return;
      }

      const distance = config?.distance || 'cosine';

      // Check if collection exists
      const existing = this.db.prepare('SELECT name FROM collections WHERE name = ?').get(name);

      if (!existing) {
        // Create collection
        this.db.prepare(`
          INSERT INTO collections (name, dimension, distance)
          VALUES (?, ?, ?)
        `).run(name, dimension, distance);
      }

      this.collections.add(name);
    } catch (error) {
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

      const stmt = this.db.prepare(`
        INSERT INTO vectors (id, collection, vector, payload)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(collection, id) DO UPDATE SET
          vector = excluded.vector,
          payload = excluded.payload,
          updated_at = strftime('%s', 'now')
      `);

      const insertMany = this.db.transaction((points: VectorPoint[]) => {
        for (const point of points) {
          const vectorBlob = this.vectorToBlob(point.vector);
          const payloadJson = JSON.stringify({
            text: point.payload?.text || '',
            ...point.payload,
          });

          stmt.run(point.id, collection, vectorBlob, payloadJson);
        }
      });

      insertMany(points);
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

      // Get collection info
      const collectionInfo = this.db.prepare('SELECT dimension, distance FROM collections WHERE name = ?').get(collection) as { dimension: number; distance: string } | undefined;

      if (!collectionInfo) {
        return [];
      }

      // Get all vectors from collection
      const rows = this.db.prepare(`
        SELECT id, vector, payload
        FROM vectors
        WHERE collection = ?
      `).all(collection) as Array<{ id: string; vector: Buffer; payload: string }>;

      // Calculate similarities
      const results: Array<{ id: string; score: number; payload: any }> = [];

      for (const row of rows) {
        const storedVector = this.blobToVector(row.vector);
        const payload = JSON.parse(row.payload);

        // Apply filter if provided
        if (options.filter && !this.matchesFilter(payload, options.filter)) {
          continue;
        }

        const score = this.calculateSimilarity(vector, storedVector, collectionInfo.distance);

        if (score >= scoreThreshold) {
          results.push({
            id: row.id,
            score,
            payload,
          });
        }
      }

      // Sort by score descending and limit
      results.sort((a, b) => b.score - a.score);
      const limited = results.slice(0, limit);

      return limited.map(result => {
        const system = result.payload.system || {};

        return {
          id: result.id,
          text: result.payload.text || '',
          score: result.score,
          createdAt: system.createdAt || Date.now(),
          metadata: result.payload,
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

      const stmt = this.db.prepare(`
        DELETE FROM vectors
        WHERE collection = ? AND id = ?
      `);

      const deleteMany = this.db.transaction((ids: string[]) => {
        for (const id of ids) {
          stmt.run(collection, id);
        }
      });

      deleteMany(ids);
    } catch (error) {
      throw new VectorStoreError(
        `Failed to delete points from collection '${collection}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteCollection(collection: string): Promise<void> {
    try {
      // Delete all vectors first
      this.db.prepare('DELETE FROM vectors WHERE collection = ?').run(collection);

      // Delete collection
      this.db.prepare('DELETE FROM collections WHERE name = ?').run(collection);

      this.collections.delete(collection);
    } catch (error) {
      throw new VectorStoreError(
        `Failed to delete collection '${collection}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async getIdsByFilter(collection: string, filter: Record<string, any>, limit: number = 10000): Promise<string[]> {
    try {
      // Get all vectors from collection
      const rows = this.db.prepare(`
        SELECT id, payload
        FROM vectors
        WHERE collection = ?
        LIMIT ?
      `).all(collection, limit) as Array<{ id: string; payload: string }>;

      // Filter by matching payload
      const matchingIds: string[] = [];

      for (const row of rows) {
        const payload = JSON.parse(row.payload);
        if (this.matchesFilter(payload, filter)) {
          matchingIds.push(row.id);
        }
      }

      return matchingIds;
    } catch (error) {
      throw new VectorStoreError(
        `Failed to get IDs by filter from collection '${collection}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get database statistics
   */
  getStats(collection?: string): { collections: number; vectors: number } {
    if (collection) {
      const result = this.db.prepare('SELECT COUNT(*) as count FROM vectors WHERE collection = ?').get(collection) as { count: number };
      return { collections: 1, vectors: result.count };
    }

    const collections = this.db.prepare('SELECT COUNT(*) as count FROM collections').get() as { count: number };
    const vectors = this.db.prepare('SELECT COUNT(*) as count FROM vectors').get() as { count: number };

    return { collections: collections.count, vectors: vectors.count };
  }

  // Private helper methods

  private vectorToBlob(vector: number[]): Buffer {
    // Store as Float32Array for efficient storage
    const float32 = new Float32Array(vector);
    return Buffer.from(float32.buffer);
  }

  private blobToVector(blob: Buffer): number[] {
    const float32 = new Float32Array(blob.buffer, blob.byteOffset, blob.length / 4);
    return Array.from(float32);
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

  private matchesFilter(payload: Record<string, any>, filter: Record<string, any>): boolean {
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

  private extractMetadata(payload: Record<string, unknown>): Record<string, any> {
    const { text, ...metadata } = payload;
    return metadata;
  }
}

