# Custom Providers

Voctar supports custom providers for embeddings and storage.

## Use Custom Providers

```typescript
import { Voctar } from 'voctar';

const vector = new Voctar({
  embedding: {
    type: 'custom',
    provider: myEmbeddingProvider,
  },
  store: {
    type: 'custom',
    provider: myVectorStoreProvider,
  },
});
```

## Custom Embedding Provider

Implement the `EmbeddingProvider` interface:

```typescript
import type { EmbeddingProvider } from 'voctar';

export class MyEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    // Return one embedding vector for one text
    return [/* ... */];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Return one vector per input text (same order)
    return texts.map(() => [/* ... */]);
  }

  getDimension(): number {
    return 1536;
  }

  getModelName(): string {
    return 'my-embedding-model';
  }

  getTokenLimit(): number {
    return 8192;
  }
}
```

## Custom Store Provider

Implement the `VectorStoreProvider` interface:

```typescript
import type {
  VectorStoreProvider,
  VectorPoint,
  SearchOptions,
  SearchResult,
  CollectionConfig,
} from 'voctar';

export class MyVectorStoreProvider implements VectorStoreProvider {
  async ensureCollection(name: string, dimension: number, config?: CollectionConfig): Promise<void> {
    // Create collection/index if missing
  }

  async upsert(collection: string, points: VectorPoint[]): Promise<void> {
    // Insert or update vectors
  }

  async search(collection: string, vector: number[], options: SearchOptions): Promise<SearchResult[]> {
    // Return scored results in descending relevance
    return [];
  }

  async delete(collection: string, ids: string[]): Promise<void> {
    // Delete matching IDs
  }

  async deleteCollection(collection: string): Promise<void> {
    // Drop collection/index
  }

  async getIdsByFilter(collection: string, filter: Record<string, any>, limit?: number): Promise<string[]> {
    // Return IDs that match filter
    return [];
  }
}
```

## Integration Tips

- Keep `embedBatch()` order stable with input order.
- Ensure `getDimension()` matches vectors returned by `embed()`/`embedBatch()`.
- Normalize errors with useful messages so callers can debug quickly.
- Implement filter behavior consistently in `search()` and `getIdsByFilter()`.
