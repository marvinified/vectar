# Voctar Storage Backends

This guide covers the available storage backends in Voctar and when to use each one.

Voctar is config-first:

- your app chooses the backend,
- your app reads env vars (if any),
- your app passes explicit config to `new Voctar(...)`.

## Available Backends

Voctar supports:

- `sqlite`
- `qdrant`
- `memory`
- `custom`

## Quick Selection Guide

- Use `sqlite` for local dev and simple production workloads.
- Use `qdrant` for larger datasets, higher throughput, or multi-instance deployments.
- Use `memory` for tests and short-lived demos only.
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

See [`CUSTOM_PROVIDERS.md`](./CUSTOM_PROVIDERS.md) for full interface details.

## Environment Variable Pattern (App-Owned)

Voctar does not auto-load env vars, but many apps use a selector like this:

```bash
VECTOR_STORE=sqlite  # sqlite | qdrant | memory
SQLITE_PATH=./data/vector.db
QDRANT_URL=http://localhost
QDRANT_PORT=6333
QDRANT_API_KEY=your_api_key
```

Then in app bootstrap:

```typescript
const storeType = process.env.VECTOR_STORE ?? 'sqlite';
```

## Migration and Operations Notes

- Start with `sqlite` if you are early-stage.
- Move to `qdrant` when dataset size, traffic, or deployment topology requires it.
- Back up SQLite database files regularly.
- For Qdrant, use snapshots/backups supported by your Qdrant setup.
