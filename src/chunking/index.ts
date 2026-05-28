// Main chunking service
import { v4 as uuidv4 } from 'uuid';
import type { Chunk, ChunkingOptions, ChunkingStrategy, DocumentChunkResult } from './types';
import { FixedSizeChunkingStrategy } from './strategies/fixed';
import { RecursiveChunkingStrategy } from './strategies/recursive';
import { SentenceChunkingStrategy } from './strategies/sentence';
import { ParagraphChunkingStrategy } from './strategies/paragraph';
import { SemanticChunkingStrategy } from './strategies/semantic';

export class ChunkingService {
  private strategies: Map<string, ChunkingStrategy>;
  private defaultStrategy: string = 'recursive';

  constructor() {
    this.strategies = new Map();
    
    // Register built-in strategies
    this.registerStrategy(new FixedSizeChunkingStrategy());
    this.registerStrategy(new RecursiveChunkingStrategy());
    this.registerStrategy(new SentenceChunkingStrategy());
    this.registerStrategy(new ParagraphChunkingStrategy());
    this.registerStrategy(new SemanticChunkingStrategy());
  }

  /**
   * Register a custom chunking strategy
   */
  registerStrategy(strategy: ChunkingStrategy): void {
    this.strategies.set(strategy.getName(), strategy);
  }

  /**
   * Chunk a single document
   */
  chunkDocument(
    text: string,
    options: ChunkingOptions = {},
    documentId?: string
  ): DocumentChunkResult {
    const docId = documentId || uuidv4();
    const strategy = options.strategy || this.defaultStrategy;

    const chunkingStrategy = this.strategies.get(strategy);
    if (!chunkingStrategy) {
      throw new Error(`Unknown chunking strategy: ${strategy}`);
    }

    const chunks = chunkingStrategy.chunk(text, docId, options);

    return {
      documentId: docId,
      chunks,
      metadata: {
        originalLength: text.length,
        totalChunks: chunks.length,
        strategy,
        ...options.metadata,
      },
    };
  }

  /**
   * Chunk multiple documents
   */
  chunkDocuments(
    documents: Array<{ text: string; id?: string; metadata?: Record<string, any> }>,
    options: ChunkingOptions = {}
  ): DocumentChunkResult[] {
    return documents.map(doc => {
      const docOptions: ChunkingOptions = {
        ...options,
        metadata: { ...options.metadata, ...doc.metadata },
      };
      
      return this.chunkDocument(doc.text, docOptions, doc.id);
    });
  }

  /**
   * Estimate token count using accurate tokenizer
   */
  estimateTokens(text: string): number {
    const { countTokens } = require('./utils/tokenizer');
    return countTokens(text);
  }

  /**
   * Get optimal chunk size based on embedding model's token limit
   * Now returns tokens directly, not characters
   */
  getOptimalChunkSize(modelTokenLimit: number = 8192, safetyMargin: number = 0.8): number {
    const effectiveLimit = Math.floor(modelTokenLimit * safetyMargin);
    // Return tokens directly (not characters)
    return effectiveLimit;
  }

  /**
   * Set default chunking strategy
   */
  setDefaultStrategy(strategy: string): void {
    if (!this.strategies.has(strategy)) {
      throw new Error(`Unknown strategy: ${strategy}`);
    }
    this.defaultStrategy = strategy;
  }

  /**
   * Get list of available strategies
   */
  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }
}

// Export singleton instance
export const chunking = new ChunkingService();

// Export types and strategies
export * from './types';
export { FixedSizeChunkingStrategy } from './strategies/fixed';
export { RecursiveChunkingStrategy } from './strategies/recursive';
export { SentenceChunkingStrategy } from './strategies/sentence';
export { ParagraphChunkingStrategy } from './strategies/paragraph';
export { SemanticChunkingStrategy } from './strategies/semantic';
export type { SemanticChunkingOptions } from './strategies/semantic';

