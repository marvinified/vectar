// Chunking types and interfaces

export interface Chunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  documentId: string;
  chunkIndex: number;
  totalChunks: number;
  startChar: number;
  endChar: number;
  tokens?: number;
  [key: string]: any; // Allow custom metadata
}

export interface ChunkingOptions {
  strategy?: 'fixed' | 'recursive' | 'semantic' | 'sentence' | 'paragraph';
  maxChunkSize?: number; // Max tokens per chunk (not characters)
  overlap?: number; // Overlap between chunks in tokens (not characters)
  preserveFormatting?: boolean; // Keep newlines, etc.
  metadata?: Record<string, any>; // Custom metadata to add to all chunks
  separator?: string | string[]; // Custom separator(s) for recursive strategy
  tokenLimit?: number; // Maximum token limit for the embedding model (used for validation)
  
  // Semantic chunking options (for 'semantic' strategy)
  softLimit?: number; // Soft token limit for semantic merging
  hardLimit?: number; // Hard token limit (force cut)
  similarityThreshold?: number; // Semantic similarity threshold (0-1)
  contentType?: 'conversation' | 'text'; // Content type (auto-detected if not specified)
  contextOverlapPercent?: number; // Overlap percentage for smart overlap
  smartOverlap?: boolean; // Only overlap if semantically relevant
  volatilityWindow?: number; // Number of recent atoms to track
  generateHeaders?: boolean; // Generate chunk headers with summaries/facts
  stripNoise?: boolean; // Remove filler words and noise
  noisePatterns?: RegExp[]; // Custom noise patterns
  addRoleMarkers?: boolean; // Add role markers (user:, agent:, tool:)
  embeddingProvider?: any; // Embedding provider for semantic comparison
}

export interface ChunkingStrategy {
  chunk(text: string, documentId: string, options: ChunkingOptions): Chunk[];
  getName(): string;
}

export interface DocumentChunkResult {
  documentId: string;
  chunks: Chunk[];
  metadata: Record<string, any>;
}

