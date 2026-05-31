# Voctar Storage Backends

This guide covers the available storage backends in Voctar and when to use each one.

## Available Backends

Voctar supports:

- `sqlite`
- `qdrant`
- `memory`
- `custom`

## Quick Selection Guide

- Use `memory` for tests and short-lived demos only.
- Use `sqlite` for local dev and simple production workloads.
- Use `qdrant` for larger datasets, higher throughput, or multi-instance deployments.
- Use `custom` when integrating an internal or third-party vector store.

## SQLite Backend

Best for:

- local development,
- prototypes,
- single-node deployments.

Pros:

- no external service,
- persistent file-based storage,
- simplest setup and operations.

Trade-offs:

- limited horizontal scaling,
- shared file contention under high concurrency.

Example:

```typescript
import { Voctar } from 'voctar';

const vector = new Voctar({
  embedding: {
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
  },
  store: {
    type: 'sqlite',
    path: './data/vector.db',
  },
});
```

In-memory SQLite (testing only):

```typescript
store: {
  type: 'sqlite',
  path: ':memory:',
  inMemory: true,
}
```

## In-Memory Backend

Best for:

- unit tests,
- quick local examples.

Trade-offs:

- data is lost on restart,
- unsuitable for production persistence.

Example:

```typescript
import { Voctar } from 'voctar';

const vector = new Voctar({
  embedding: {
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
  },
  store: {
    type: 'memory',
  },
});
```

## Qdrant Backend

Best for:

- medium and large datasets,
- high query volume,
- distributed deployments.

Pros:

- purpose-built vector DB,
- strong scale characteristics,
- rich filtering support.

Trade-offs:

- extra service to operate,
- network hop adds operational complexity.

Example:

```typescript
import { Voctar } from 'voctar';

const vector = new Voctar({
  embedding: {
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
  },
  store: {
    type: 'qdrant',
    url: process.env.QDRANT_URL!,
    port: process.env.QDRANT_PORT ? Number(process.env.QDRANT_PORT) : 6333,
    apiKey: process.env.QDRANT_API_KEY || undefined,
    timeout: 30000,
    checkCompatibility: false,
  },
});
```


## Custom Backend

Use this when you need full control over storage behavior.

The provider must implement `VectorStoreProvider`.

Example:

```typescript
import { Voctar } from 'voctar';

const vector = new Voctar({
  embedding: {
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
  },
  store: {
    type: 'custom',
    provider: myVectorStoreProvider,
  },
});
```

Full interface example:

```typescript
import type {
  CollectionConfig,
  SearchOptions,
  SearchResult,
  VectorPoint,
  VectorStoreProvider,
} from 'voctar';

export class MyVectorStoreProvider implements VectorStoreProvider {
  async ensureCollection(name: string, dimension: number, config?: CollectionConfig): Promise<void> {
    // Create collection/index if missing.
  }

  async upsert(collection: string, points: VectorPoint[]): Promise<void> {
    // Insert or update vectors.
  }

  async search(collection: string, vector: number[], options: SearchOptions): Promise<SearchResult[]> {
    // Return scored results in descending relevance.
    return [];
  }

  async delete(collection: string, ids: string[]): Promise<void> {
    // Delete matching IDs.
  }

  async deleteCollection(collection: string): Promise<void> {
    // Drop collection/index.
  }

  async getIdsByFilter(collection: string, filter: Record<string, any>, limit?: number): Promise<string[]> {
    // Return IDs that match filter.
    return [];
  }
}
```

Integration tips:

- Ensure `ensureCollection()` respects the embedding provider dimension.
- Implement filter behavior consistently in `search()` and `getIdsByFilter()`.
- Return search results in descending relevance order.
- Normalize storage errors with useful messages so callers can debug quickly.
