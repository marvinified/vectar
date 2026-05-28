// Recursive text splitting strategy - tries to split on natural boundaries
import { v4 as uuidv4 } from 'uuid';
import type { Chunk, ChunkingOptions, ChunkingStrategy } from '../types';
import { countTokens } from '../utils/tokenizer';

export class RecursiveChunkingStrategy implements ChunkingStrategy {
  getName(): string {
    return 'recursive';
  }

  chunk(text: string, documentId: string, options: ChunkingOptions): Chunk[] {
    // Get token limit and ensure maxSize doesn't exceed it
    const tokenLimit = (options as any).tokenLimit ?? 8192;
    const maxSize = Math.min(options.maxChunkSize ?? 1000, tokenLimit);
    const overlap = Math.min(options.overlap ?? 200, Math.floor(maxSize * 0.2)); // Overlap shouldn't exceed 20% of maxSize
    
    // Default separators in order of preference (paragraph > sentence > word > char)
    const defaultSeparators = [
      '\n\n',  // Paragraph
      '\n',    // Line break
      '. ',    // Sentence
      '! ',    // Sentence
      '? ',    // Sentence
      '; ',    // Clause
      ', ',    // Phrase
      ' ',     // Word
      '',      // Character
    ];

    const separators = options.separator 
      ? (Array.isArray(options.separator) ? options.separator : [options.separator])
      : defaultSeparators;

    const chunks = this.recursiveSplit(text, maxSize, overlap, separators);
    
    // Convert to Chunk objects with metadata
    let startChar = 0;
    const result: Chunk[] = [];

    chunks.forEach((chunkText, index) => {
      const endChar = startChar + chunkText.length;
      
      result.push({
        id: uuidv4(),
        text: chunkText,
        metadata: {
          documentId,
          chunkIndex: index,
          totalChunks: chunks.length,
          startChar,
          endChar,
          ...options.metadata,
        },
      });

      // Account for overlap in start position
      startChar = endChar - overlap;
    });

    return result;
  }

  private recursiveSplit(
    text: string,
    maxSize: number, // maxSize is now in tokens
    overlap: number, // overlap is now in tokens
    separators: string[]
  ): string[] {
    const finalChunks: string[] = [];

    // Base case: if text token count is small enough, return it
    const textTokens = countTokens(text);
    if (textTokens <= maxSize) {
      return text.trim() ? [text.trim()] : [];
    }

    // Try each separator in order
    for (const separator of separators) {
      if (separator === '') {
        // Character-level split as last resort
        return this.splitByCharacters(text, maxSize, overlap);
      }

      if (text.includes(separator)) {
        const splits = text.split(separator);
        const chunks = this.mergeSplits(splits, separator, maxSize, overlap);
        
        // If any chunk is still too large (by token count), recursively split it
        for (const chunk of chunks) {
          const chunkTokens = countTokens(chunk);
          if (chunkTokens > maxSize) {
            // Find next separator in the list
            const nextSeparatorIndex = separators.indexOf(separator) + 1;
            const remainingSeparators = separators.slice(nextSeparatorIndex);
            finalChunks.push(...this.recursiveSplit(chunk, maxSize, overlap, remainingSeparators));
          } else if (chunk.trim()) {
            finalChunks.push(chunk.trim());
          }
        }

        return finalChunks;
      }
    }

    // Fallback to character split
    return this.splitByCharacters(text, maxSize, overlap);
  }

  private mergeSplits(
    splits: string[],
    separator: string,
    maxSize: number, // maxSize is now in tokens
    overlap: number // overlap is now in tokens
  ): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];
      const piece = i < splits.length - 1 ? split + separator : split;
      const combined = currentChunk + piece;
      const combinedTokens = countTokens(combined);

      if (combinedTokens <= maxSize) {
        currentChunk = combined;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
          // Start new chunk with overlap (in tokens)
          // Find overlap by binary search or by character approximation
          const overlapText = this.getOverlapText(currentChunk, overlap);
          currentChunk = overlapText + piece;
        } else {
          // Single piece is larger than maxSize, add it anyway (will be split recursively)
          currentChunk = piece;
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Get overlap text that is approximately 'overlapTokens' tokens
   */
  private getOverlapText(text: string, overlapTokens: number): string {
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

  private splitByCharacters(text: string, maxSize: number, overlap: number): string[] {
    // maxSize and overlap are in tokens, but we need to split by characters
    // Use binary search to find character positions that match token limits
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const chunkText = this.getTextUpToTokenLimit(text.slice(start), maxSize);
      if (!chunkText) break;
      
      chunks.push(chunkText);
      const chunkLength = chunkText.length;
      
      // Calculate overlap start position
      const overlapText = this.getOverlapText(chunkText, overlap);
      start += chunkLength - overlapText.length;

      if (text.length - start < overlapText.length) {
        break;
      }
    }

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
}

