# Voctar Embeddings

This guide covers embedding model configuration in Voctar.

Voctar is config-first:

- your app chooses the embedding provider,
- your app reads env vars or secrets,
- your app passes explicit config to `new Voctar(...)`.

## Available Providers

Voctar supports:

- `openai`
- `custom`

## OpenAI Provider

The built-in OpenAI provider is the default path for most apps.

Defaults:

- `model`: `text-embedding-3-small`
- `dimension`: `1536`
- `maxRetries`: `3`

Example:

```typescript
import { Voctar } from 'voctar';

const vector = new Voctar({
  embedding: {
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'text-embedding-3-small',
    dimension: 1536,
  },
  store: {
    type: 'sqlite',
    path: './data/vector.db',
  },
});
```

You can pass any OpenAI embedding model supported by the OpenAI API. If the model supports configurable embedding dimensions, set `dimension` to the vector size you want to store.

## Model and Dimension Notes

The embedding dimension must match the vector store collection dimension. Existing collections cannot mix vectors with different dimensions, so changing `model` or `dimension` usually requires a new collection.

Voctar uses the provider token limit to decide when documents should be chunked automatically. The built-in OpenAI provider uses:

- `8192` tokens for `text-embedding-3-small` and `text-embedding-3-large`
- `8191` tokens for `text-embedding-ada-002`
- `8192` tokens for other OpenAI embedding model names

## Custom Embedding Provider

Use a custom embedding provider for local models, hosted non-OpenAI models, or any embedding service with your own client.

Example:

```typescript
import { Voctar, type EmbeddingProvider } from 'voctar';

class MyEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    // Return one embedding vector for one text.
    return [/* ... */];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Return one vector per input text in the same order.
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

const vector = new Voctar({
  embedding: {
    type: 'custom',
    provider: new MyEmbeddingProvider(),
  },
  store: {
    type: 'sqlite',
    path: './data/vector.db',
  },
});
```

Integration tips:

- Keep `embedBatch()` output order stable with input order.
- Ensure `getDimension()` matches vectors returned by `embed()` and `embedBatch()`.
- Return a realistic `getTokenLimit()` so automatic chunking can split long documents before embedding.
- Normalize errors with useful messages so callers can debug provider failures quickly.
