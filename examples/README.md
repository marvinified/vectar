# Vectar Examples

This directory contains comprehensive examples demonstrating Vectar capabilities.

## Examples

### 1. Simple Example (`example-simple.ts`)
Basic usage of Vectar with automatic chunking and document management.

```bash
tsx libs/vector/examples/example-simple.ts
```

**Features demonstrated:**
- Document embedding with automatic chunking
- Semantic search across chunks
- Document updates and deletion
- Chunk metadata inspection

### 2. Basic Chunking (`chunking-basic.ts`)
Comprehensive chunking strategies and configurations.

```bash
tsx libs/vector/examples/chunking-basic.ts
```

**Features demonstrated:**
- Multiple chunking strategies (fixed, recursive, sentence, paragraph)
- Strategy comparison
- Batch chunking
- Token estimation
- Metadata tracking
- Code formatting preservation

### 3. Semantic Chunking (`chunking-semantic.ts`)
Advanced semantic chunking for conversations and complex text.

```bash
tsx libs/vector/examples/chunking-semantic.ts
```

**Features demonstrated:**
- Semantic chunking for conversations
- Technical discussion processing
- Article chunking with semantic understanding
- Integration with embedding service
- Strategy comparison

### 4. Performance Comparison (`performance-comparison.ts`)
**NEW** - Comprehensive performance testing across different vector store providers.

```bash
tsx libs/vector/examples/performance-comparison.ts
```

**Features demonstrated:**
- Performance testing across multiple providers:
  - SQLite (file-based)
  - SQLite (in-memory)
  - InMemory (pure memory)
  - Qdrant (if configured)
- Automatic provider detection and graceful fallback
- Qdrant-specific optimizations and error handling
- Embedding performance metrics
- Search performance metrics
- Comprehensive comparison tables
- Performance insights and recommendations

## Prerequisites

All examples require:
- `OPENAI_API_KEY` environment variable set
- Node.js with TypeScript support (`tsx` or `ts-node`)

Optional for Qdrant testing:
- `QDRANT_URL` environment variable (defaults to `http://localhost:6333`)
- `QDRANT_API_KEY` environment variable (optional for local development)

## Performance Test Details

The performance comparison test:

1. **Tests multiple providers** with the same dataset
2. **Measures timing** for embedding and search operations
3. **Generates comprehensive metrics** including:
   - Total processing time
   - Average embedding time per document
   - Average search time per query
   - Error tracking
4. **Provides insights** and recommendations for different use cases
5. **Cleans up** test data automatically

### Test Data
- **Small documents**: 5 short sentences
- **Medium documents**: 3 medium-length articles
- **Large documents**: 1 comprehensive technical guide

### Search Queries
Tests with 5 different semantic queries to evaluate search performance across various topics.

## Running Examples

Make sure you're in the project root directory:

```bash
# Set up environment
export OPENAI_API_KEY="your-openai-api-key"

# Run any example
tsx libs/vector/examples/example-simple.ts
tsx libs/vector/examples/chunking-basic.ts
tsx libs/vector/examples/chunking-semantic.ts
tsx libs/vector/examples/performance-comparison.ts
```

## Expected Output

Each example provides detailed console output showing:
- Progress indicators
- Results and metrics
- Error handling
- Cleanup confirmation

The performance comparison example includes a comprehensive comparison table ranking providers by performance metrics.
