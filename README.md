# Vectar

Simple TypeScript library with RAG primitives for  vector embeddings, chunking, storing and retrieval.

## Features

- Supports multiple vector stores: SQLite, Qdrant, in-memory, or custom store providers
- Automatic chunking for long documents with multiple strategies (`fixed`, `recursive`, `sentence`, `paragraph`, `semantic`)
- Semantic search with score thresholds and metadata filtering
- Simple primitives: `embed`, `search` and more
- TypeScript-first.

## Quick Start

```typescript
import { Vectar } from 'vectar';

const vector = new Vectar({
  embedding: {
    type: 'openai',
    apiKey: '<your-api-key>',
  },
  store: {
    type: 'sqlite',
    path: 'data/vector.db',
  },
});

const { documentId } = await vector.embed('documents', "Very long text...", {
  metadata: { author: 'Alice' },
});

const results = await vector.search('documents', 'Some query');
```

## Primitives API

### `embed(collection, text, options?)`

Embeds a document into a collection.  
If the text exceeds model limits, Vectar auto-chunks and stores chunk vectors.

```typescript
const { documentId, chunkIds } = await vector.embed('documents', longText, {
  documentId: 'doc-1',                 // optional; auto-generated if omitted
  metadata: { source: 'guide' },       // optional user metadata
  chunkSize: 1000,                     // optional
  chunkStrategy: 'recursive',          // fixed | recursive | sentence | paragraph | semantic
  chunkOverlap: 200,                   // optional
  autoChunk: true,                     // optional override
});
```

Returns:

- `documentId`: stable parent id for the document
- `chunkIds`: stored ids (single id for unchunked docs, multiple for chunked docs)

### `search(collection, query, options?)`

Retrieves semantically similar text from a collection.

```typescript
const results = await vector.search('documents', 'how does chunking work', {
  limit: 5,                            // optional, default provider behavior
  scoreThreshold: 0,                   // optional
  filter: { source: 'guide' },         // optional metadata filter
  includeSystem: false,                // optional; include internal metadata when true
});
```

Each result includes:

- `id`
- `text`
- `score`
- `createdAt`
- `metadata` (and optional `system` when `includeSystem: true`)

## Documentation

- [Docs Index](./docs/README.md)
- [Storage Backends](./docs/STORAGE_BACKENDS.md)
- [Chunking](./docs/CHUNKING.md)

