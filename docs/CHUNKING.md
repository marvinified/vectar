# Chunking Guide

This is the single source of truth for chunking in Vectar, including:

- chunk ID format and metadata model,
- strategy behavior and options,
- semantic chunking behavior,
- usage examples.

## Chunk Strategies

Different strategies for different content:

```typescript
// Code - fixed size
await vector.embed('code', sourceCode, {
  chunkStrategy: 'fixed',
  chunkSize: 2000,
});

// Articles - recursive (default, splits on natural boundaries)
await vector.embed('articles', article, {
  chunkStrategy: 'recursive',
  chunkSize: 1000,
});

// Narrative - sentence-based
await vector.embed('stories', story, {
  chunkStrategy: 'sentence',
  chunkSize: 800,
});

// Structured docs - paragraph-based
await vector.embed('docs', documentation, {
  chunkStrategy: 'paragraph',
  chunkSize: 1500,
});
```

## How Chunks Are Stored

### Chunk ID Format

Chunks use a predictable ID format: `documentId#chunkIndex`

```typescript
// Document ID: "user-manual-v2"
// Chunks get IDs like:
"user-manual-v2#0"  // First chunk
"user-manual-v2#1"  // Second chunk
"user-manual-v2#2"  // Third chunk
// ... etc
```

### Benefits

1. **Easy Identification**: You can tell which document a chunk belongs to
2. **Ordered Retrieval**: Chunk index preserves the order
3. **Simple Deletion**: Delete all chunks by ID pattern
4. **No External Tracking**: No need for separate mapping tables

### Metadata Structure

Every chunk stores rich metadata:

```typescript
{
  // User metadata
  title: "User Manual",
  author: "Tech Team",
  version: "2.0",
  
  // Chunk position info
  documentId: "user-manual-v2",
  chunkIndex: 0,           // 0-based index
  totalChunks: 15,         // Total chunks in document
  startChar: 0,            // Start position in original text
  endChar: 1000,           // End position in original text
  
  // System metadata
  _isChunk: true,          // Indicates this is a chunk
  _documentId: "user-manual-v2",  // Parent document ID
  _chunkId: "user-manual-v2#0",   // Full chunk ID
  
  // Original text
  text: "Chapter 1: Introduction..."
}
```

## Examples

### Basic Chunking

```typescript
import { Vectar } from '@libs/vectar';

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

const longText = '...10,000 characters...';

// Embed with auto-chunking
const result = await vector.embed('docs', longText, {
  documentId: 'article-123',
  metadata: { author: 'Alice' }
});

console.log(result.documentId);  // "article-123"
console.log(result.chunkIds);    // ["article-123#0", "article-123#1", ...]
```

### Parsing Chunk IDs

```typescript
import { Vectar } from '@libs/vectar';

const chunkId = "article-123#5";

// Parse chunk ID
const parsed = Vectar.parseChunkId(chunkId);
console.log(parsed);
// { documentId: "article-123", chunkIndex: 5 }

// Check if ID is a chunk
console.log(Vectar.isChunkId(chunkId));  // true
console.log(Vectar.isChunkId("article-123"));  // false

// Generate chunk ID
const id = Vectar.getChunkId("article-123", 5);
console.log(id);  // "article-123#5"
```

### Search with Chunk Context

```typescript
const results = await vector.search('docs', 'installation steps');

results.forEach(result => {
  // Check if result is from a chunked document
  if (Vectar.isChunkId(result.id)) {
    const { documentId, chunkIndex } = Vectar.parseChunkId(result.id)!;
    
    console.log(`Found in document: ${documentId}`);
    console.log(`Chunk ${chunkIndex + 1} of ${result.metadata.totalChunks}`);
    console.log(`Text position: ${result.metadata.startChar}-${result.metadata.endChar}`);
  } else {
    console.log(`Non-chunked document: ${result.id}`);
  }
  
  console.log(result.text);
});
```

### Reconstructing Original Document

```typescript
// Search for all chunks of a document
const results = await vector.search('docs', 'anything', {
  filter: { _documentId: 'article-123' },
  limit: 1000,
});

// Sort chunks by index
const sortedChunks = results
  .map(r => ({
    ...r,
    ...Vectar.parseChunkId(r.id)!
  }))
  .sort((a, b) => a.chunkIndex - b.chunkIndex);

// Reconstruct (approximately - note overlap)
const reconstructed = sortedChunks
  .map(chunk => chunk.text)
  .join('\n\n');
```

### Deletion

```typescript
// Delete document and all its chunks
await vector.delete('docs', 'article-123');

// This deletes:
// - article-123 (if it wasn't chunked)
// - article-123#0, article-123#1, article-123#2, ... (all chunks)
```

### Upsert (Update)

```typescript
// Original document
await vector.embed('docs', originalText, {
  documentId: 'article-123',
  metadata: { version: 1 }
});

// Update the entire document
await vector.upsert('docs', 'article-123', updatedText, {
  metadata: { version: 2, updated: Date.now() }
});

// All old chunks are deleted
// New chunks are created with same documentId
// Chunk IDs reset: article-123#0, article-123#1, ...
```

## Implementation Notes

### Max Chunks Per Document

Currently limited to 1000 chunks per document for efficient deletion.

If your documents might exceed this:

```typescript
// Increase chunk size
await vector.embed('docs', veryLongText, {
  chunkSize: 2000,  // Larger chunks = fewer chunks
});

// Or split into multiple documents
const parts = splitIntoSections(veryLongText);
for (const [index, part] of parts.entries()) {
  await vector.embed('docs', part, {
    documentId: `article-123-part${index}`,
  });
}
```

### Chunk ID Character Limit

Keep document IDs reasonable (< 100 chars) to avoid hitting ID length limits in vector stores.

### Metadata Filtering

Filter searches by chunk metadata:

```typescript
// Find only first chunks
const results = await vector.search('docs', 'query', {
  filter: { chunkIndex: 0 }
});

// Find chunks from specific document
const results = await vector.search('docs', 'query', {
  filter: { _documentId: 'article-123' }
});

// Combine filters
const results = await vector.search('docs', 'query', {
  filter: {
    _documentId: 'article-123',
    author: 'Alice',
  }
});
```

## Best Practices

1. **Use meaningful document IDs**: They become part of chunk IDs
2. **Add rich metadata**: Makes filtering and retrieval easier
3. **Choose appropriate chunk size**: Balance between context and precision
4. **Use chunk overlap**: Prevents losing context at boundaries
5. **Track versions**: Include version info in metadata for updates

## Future Improvements

- [ ] Metadata-based deletion (query by `_documentId` and delete all matches)
- [ ] Chunk merging for adjacent results
- [ ] Automatic chunk retrieval by proximity
- [ ] Chunk caching for faster document reconstruction

