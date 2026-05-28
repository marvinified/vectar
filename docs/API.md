# Voctar API Reference

This document covers the full public API exported by `voctar`.

## Package Exports

```typescript
import {
  Voctar,
  Vector, // alias of Voctar
  chunking,
  ChunkingService,
  // types
  type VectorConfig,
  type EmbedOptions,
  type SearchOptions,
  type SearchResult,
  type VectorDocument,
  type CollectionConfig,
  type EmbeddingProvider,
  type VectorStoreProvider,
  // errors
  VectorEmbeddingError,
  VectorSearchError,
  VectorStoreError,
} from 'voctar';
```

## `class Voctar` (aka `Vector`)

### Constructor

```typescript
new Voctar(config?: VectorConfig)
```

Creates a Voctar client with embedding and store providers.

Notes:

- If `store` is omitted, Voctar defaults to SQLite at `./vector.db`.
- `autoChunk` defaults to `true`.
- `defaultChunkStrategy` defaults to `'recursive'`.
- `defaultChunkSize` defaults to `1000`.
- `defaultChunkOverlap` defaults to `200`.

### `embed(collection, text, options?)`

```typescript
embed(
  collection: string,
  text: string,
  options?: EmbedOptions
): Promise<{ documentId: string; chunkIds: string[] }>
```

Embeds one document into a collection.

Behavior:

- Validates collection name and text.
- Ensures collection exists.
- Auto-chunks when needed (based on token limits and chunk settings).
- If `options.documentId` is provided and already exists, old chunks are removed first.

Returns:

- `documentId`: parent document id
- `chunkIds`: final stored ids

### `embedBatch(collection, documents, user_id?)`

```typescript
embedBatch(
  collection: string,
  documents: VectorDocument[],
  user_id?: string
): Promise<string[]>
```

Embeds multiple documents in one batch.

Behavior:

- Ensures collection exists.
- Re-chunks oversized documents when they exceed model token limits.
- Upserts all vectors to the configured store.

Returns:

- Array of stored point ids.

### `search(collection, query, options?)`

```typescript
search(
  collection: string,
  query: string,
  options?: SearchOptions
): Promise<SearchResult[]>
```

Performs semantic similarity search.

Behavior:

- Embeds the query.
- Searches configured vector store.
- Returns normalized results with ISO `createdAt`.
- Includes internal system metadata only when `includeSystem` is `true`.

### `upsert(collection, documentId, text, options?)`

```typescript
upsert(
  collection: string,
  documentId: string,
  text: string,
  options?: EmbedOptions
): Promise<void>
```

Replaces a document:

1. deletes previous document/chunks by `documentId`,
2. re-embeds the new text with the same `documentId`.

### `delete(collection, documentId | documentIds)`

```typescript
delete(collection: string, documentId: string | string[]): Promise<void>
```

Deletes one or many documents and their chunks.

Behavior:

- Deletes direct ids.
- Also resolves chunk ids through `system._documentId` filter and deletes them.

### `deleteCollection(collection)`

```typescript
deleteCollection(collection: string): Promise<void>
```

Deletes an entire collection from the configured store.

### `ensureCollection(collection, config?)`

```typescript
ensureCollection(
  collection: string,
  config?: CollectionConfig
): Promise<void>
```

Ensures collection exists with optional collection configuration.

### `getEmbeddingProvider()`

```typescript
getEmbeddingProvider(): EmbeddingProvider
```

Returns the active embedding provider instance.

### `getVectorStoreProvider()`

```typescript
getVectorStoreProvider(): VectorStoreProvider
```

Returns the active vector store provider instance.

### Static Helpers

#### `Voctar.getChunkId(documentId, chunkIndex)`

```typescript
static getChunkId(documentId: string, chunkIndex: number): string
```

Builds chunk id using `documentId#chunkIndex`.

#### `Voctar.parseChunkId(chunkId)`

```typescript
static parseChunkId(
  chunkId: string
): { documentId: string; chunkIndex: number } | null
```

Parses chunk id into parent id and index, or returns `null`.

#### `Voctar.isChunkId(id)`

```typescript
static isChunkId(id: string): boolean
```

Checks whether an id contains the chunk separator format.

## Core Config and Types

### `VectorConfig`

```typescript
interface VectorConfig {
  embedding?: RuntimeEmbeddingConfig;
  store?: RuntimeStoreConfig;
  embeddingProvider?: EmbeddingProvider; // deprecated
  vectorStoreProvider?: VectorStoreProvider; // deprecated
  defaultChunkSize?: number;
  defaultChunkStrategy?: 'fixed' | 'recursive' | 'semantic' | 'sentence' | 'paragraph';
  defaultChunkOverlap?: number;
  autoChunk?: boolean;
}
```

### `EmbedOptions`

```typescript
interface EmbedOptions {
  documentId?: string;
  metadata?: Record<string, any>;
  chunkSize?: number;
  chunkStrategy?: 'fixed' | 'recursive' | 'semantic' | 'sentence' | 'paragraph';
  chunkOverlap?: number;
  autoChunk?: boolean;
  user_id?: string;
}
```

### `SearchOptions`

```typescript
interface SearchOptions {
  limit?: number;
  scoreThreshold?: number;
  filter?: Record<string, any>;
  includeSystem?: boolean;
}
```

Filter behavior:

- keys without `.` are matched under `metadata.*`
- keys with `.` are used as-is
- scalar = equality
- array = OR match for that field

### `SearchResult`

```typescript
interface SearchResult {
  id: string;
  text: string;
  score: number;
  createdAt: string; // ISO 8601
  metadata?: Record<string, any>;
  system?: Record<string, any>; // only when includeSystem=true
}
```

### `RuntimeEmbeddingConfig`

```typescript
type RuntimeEmbeddingConfig =
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
```

### `RuntimeStoreConfig`

```typescript
type RuntimeStoreConfig =
  | { type: 'sqlite'; path?: string; inMemory?: boolean }
  | { type: 'qdrant'; url: string; port?: number; apiKey?: string; timeout?: number; checkCompatibility?: boolean }
  | { type: 'memory' }
  | { type: 'custom'; provider: VectorStoreProvider };
```

### `CollectionConfig`

```typescript
interface CollectionConfig {
  dimension?: number;
  distance?: 'cosine' | 'euclidean' | 'dot';
}
```

### `VectorDocument`

```typescript
interface VectorDocument {
  id: string;
  text: string;
  metadata?: Record<string, any>;
}
```

## Provider Interfaces

### `EmbeddingProvider`

```typescript
interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  getDimension(): number;
  getModelName(): string;
  getTokenLimit(): number;
}
```

### `VectorStoreProvider`

```typescript
interface VectorStoreProvider {
  ensureCollection(name: string, dimension: number, config?: CollectionConfig): Promise<void>;
  upsert(collection: string, points: VectorPoint[]): Promise<void>;
  search(collection: string, vector: number[], options: SearchOptions): Promise<SearchResult[]>;
  delete(collection: string, ids: string[]): Promise<void>;
  deleteCollection(collection: string): Promise<void>;
  getIdsByFilter(collection: string, filter: Record<string, any>, limit?: number): Promise<string[]>;
}
```

## Error Types

### `VectorEmbeddingError`

- Raised on embedding/chunking/query-embedding failures.
- Includes optional `cause` and optional `data`.

### `VectorSearchError`

- Raised by store-level search providers.

### `VectorStoreError`

- Raised on store operations (collection creation, delete, upsert, etc.).

## Chunking API

Voctar also exports chunking utilities:

- `chunking` singleton service
- `ChunkingService` class

For full chunking-specific API and behavior, see [`CHUNKING.md`](./CHUNKING.md).
