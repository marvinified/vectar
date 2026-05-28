// Fixed-size chunking strategy
import { v4 as uuidv4 } from 'uuid';
import type { Chunk, ChunkingOptions, ChunkingStrategy } from '../types';
import { countTokens } from '../utils/tokenizer';

export class FixedSizeChunkingStrategy implements ChunkingStrategy {
  getName(): string {
    return 'fixed';
  }

  chunk(text: string, documentId: string, options: ChunkingOptions): Chunk[] {
    // Get token limit and ensure maxSize doesn't exceed it
    const tokenLimit = (options as any).tokenLimit ?? 8192;
    const maxSize = Math.min(options.maxChunkSize ?? 1000, tokenLimit);
    const overlap = Math.min(options.overlap ?? 200, Math.floor(maxSize * 0.2));
    const preserveFormatting = options.preserveFormatting ?? false;

    // Normalize text if not preserving formatting
    const normalizedText = preserveFormatting 
      ? text 
      : text.replace(/\s+/g, ' ').trim();

    const chunks: Chunk[] = [];
    let startChar = 0;
    let chunkIndex = 0;

    while (startChar < normalizedText.length) {
      // Get text up to token limit
      const remainingText = normalizedText.slice(startChar);
      const chunkText = this.getTextUpToTokenLimit(remainingText, maxSize);
      
      if (!chunkText || chunkText.length === 0) {
        break;
      }

      const endChar = startChar + chunkText.length;

      chunks.push({
        id: uuidv4(),
        text: chunkText,
        metadata: {
          documentId,
          chunkIndex,
          totalChunks: 0, // Will be updated after all chunks are created
          startChar,
          endChar,
          tokens: countTokens(chunkText),
          ...options.metadata,
        },
      });

      // Calculate overlap position using token count
      const overlapText = this.getOverlapText(chunkText, overlap);
      startChar = endChar - overlapText.length;
      chunkIndex++;

      // Avoid creating tiny overlapping chunks at the end
      if (normalizedText.length - startChar < overlapText.length) {
        break;
      }
    }

    // Update totalChunks for all chunks
    chunks.forEach(chunk => {
      chunk.metadata.totalChunks = chunks.length;
    });

    return chunks;
  }

  /**
   * Get text up to a token limit
   */
  private getTextUpToTokenLimit(text: string, maxTokens: number): string {
    if (countTokens(text) <= maxTokens) {
      return text;
    }

    // Binary search for the right character position
    let start = 0;
    let end = text.length;
    let bestMatch = '';

    while (start < end) {
      const mid = Math.floor((start + end) / 2);
      const candidate = text.slice(0, mid);
      const tokens = countTokens(candidate);

      if (tokens <= maxTokens) {
        bestMatch = candidate;
        start = mid + 1;
      } else {
        end = mid;
      }
    }

    return bestMatch || text.slice(0, Math.floor(text.length * 0.8)); // Fallback to 80%
  }

  /**
   * Get overlap text that is approximately 'overlapTokens' tokens
   */
  private getOverlapText(text: string, overlapTokens: number): string {
    if (overlapTokens === 0) return '';
    
    // Binary search for the right amount of text
    let start = 0;
    let end = text.length;
    let bestMatch = '';

    while (start < end) {
      const mid = Math.floor((start + end) / 2);
      const candidate = text.slice(mid);
      const tokens = countTokens(candidate);

      if (tokens <= overlapTokens) {
        bestMatch = candidate;
        end = mid;
      } else {
        start = mid + 1;
      }
    }

    return bestMatch || text.slice(-Math.floor(text.length * 0.1)); // Fallback to last 10%
  }
}

