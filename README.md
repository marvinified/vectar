<p align="center">
  <img src="./docs/assets/vectar.png" alt="Vectar logo" width="180" />
</p>

<h1 align="center">Vectar</h1>

<p align="center">
  Simple TypeScript library with RAG primitives for embeddings, chunking, storage, and semantic retrieval.
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" />
  <img alt="Node" src="https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js&logoColor=white" />
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg" />
  <img alt="RAG primitives" src="https://img.shields.io/badge/RAG-primitives-7C3AED" />
  <img alt="Chunking" src="https://img.shields.io/badge/Chunking-fixed%20%7C%20recursive%20%7C%20sentence%20%7C%20paragraph%20%7C%20semantic-2563EB" />
  <img alt="Stores" src="https://img.shields.io/badge/Stores-SQLite%20%7C%20Qdrant%20%7C%20Memory-0EA5E9" />
</p>

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

