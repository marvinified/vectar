// OpenAI embedding provider
import { OpenAI } from 'openai';
import type { EmbeddingProvider } from '../../types';
import { VectorEmbeddingError } from '../../types';

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  model?: string;
  dimension?: number;
  maxRetries?: number;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private client: OpenAI;
  private model: string;
  private dimension: number;
  private maxRetries: number;

  constructor(config: OpenAIEmbeddingConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      maxRetries: config.maxRetries ?? 3,
    });
    this.model = config.model ?? 'text-embedding-3-small';
    this.dimension = config.dimension ?? 1536;
    this.maxRetries = config.maxRetries ?? 3;
  }

  async embed(text: string): Promise<number[]> {
    try {
      const normalized = this.normalizeText(text);
      const response = await this.client.embeddings.create({
        model: this.model,
        input: normalized,
        dimensions: this.dimension,
      });

      return response.data[0].embedding;
    } catch (error) {
      throw new VectorEmbeddingError(
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      // OpenAI supports up to 2048 inputs per request, but we'll be conservative
      const batchSize = 100;
      const batches: string[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        batches.push(texts.slice(i, i + batchSize));
      }

      const results: number[][] = [];

      for (const batch of batches) {
        const normalized = batch.map(t => this.normalizeText(t));
        const response = await this.client.embeddings.create({
          model: this.model,
          input: normalized,
          dimensions: this.dimension,
        });

        results.push(...response.data.map(d => d.embedding));
      }

      return results;
    } catch (error) {
      throw new VectorEmbeddingError(
        `Failed to generate batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  getDimension(): number {
    return this.dimension;
  }

  getModelName(): string {
    return this.model;
  }

  getTokenLimit(): number {
    // OpenAI embedding models have different token limits
    // text-embedding-3-small and text-embedding-3-large: 8192 tokens
    // text-embedding-ada-002: 8191 tokens
    // Older models may have different limits, default to 8192
    if (this.model.includes('text-embedding-3')) {
      return 8192;
    }
    if (this.model.includes('text-embedding-ada-002')) {
      return 8191;
    }
    // Default for other models
    return 8192;
  }

  private normalizeText(text: string): string {
    return text
      .trim()
      .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2
      .replace(/\s{2,}/g, ' '); // Replace multiple spaces with single space
  }
}

