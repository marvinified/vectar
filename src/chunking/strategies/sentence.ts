// Sentence-based chunking strategy
import { v4 as uuidv4 } from 'uuid';
import type { Chunk, ChunkingOptions, ChunkingStrategy } from '../types';
import { countTokens } from '../utils/tokenizer';

export class SentenceChunkingStrategy implements ChunkingStrategy {
  getName(): string {
    return 'sentence';
  }

  chunk(text: string, documentId: string, options: ChunkingOptions): Chunk[] {
    // Get token limit and ensure maxSize doesn't exceed it
    const tokenLimit = (options as any).tokenLimit ?? 8192;
    const maxSize = Math.min(options.maxChunkSize ?? 1000, tokenLimit);
    const overlap = options.overlap ?? 1; // Overlap in number of sentences

    // Split text into sentences
    const sentences = this.splitIntoSentences(text);
    
    const chunks: Chunk[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;
    let chunkIndex = 0;
    let startChar = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceTokens = countTokens(sentence);

      // If adding this sentence would exceed maxSize (in tokens) and we have content, create a chunk
      if (currentTokens + sentenceTokens > maxSize && currentChunk.length > 0) {
        const chunkText = currentChunk.join(' ').trim();
        const endChar = startChar + chunkText.length;

        chunks.push({
          id: uuidv4(),
          text: chunkText,
          metadata: {
            documentId,
            chunkIndex,
            totalChunks: 0, // Will be updated later
            startChar,
            endChar,
            sentences: currentChunk.length,
            ...options.metadata,
          },
        });

        // Keep last N sentences for overlap. slice(-0) equals slice(0), so handle zero explicitly.
        const overlapSentences = overlap > 0 ? currentChunk.slice(-overlap) : [];
        currentChunk = [...overlapSentences, sentence];
        currentTokens = countTokens(overlapSentences.join(' ')) + sentenceTokens;
        startChar = endChar - (overlapSentences.join(' ').length);
        chunkIndex++;
      } else {
        currentChunk.push(sentence);
        currentTokens += sentenceTokens;
      }
    }

    // Add remaining content as final chunk
    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join(' ').trim();
      const endChar = startChar + chunkText.length;

      chunks.push({
        id: uuidv4(),
        text: chunkText,
        metadata: {
          documentId,
          chunkIndex,
          totalChunks: 0,
          startChar,
          endChar,
          sentences: currentChunk.length,
          ...options.metadata,
        },
      });
    }

    // Update totalChunks
    chunks.forEach(chunk => {
      chunk.metadata.totalChunks = chunks.length;
    });

    return chunks;
  }

  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitter - could be improved with NLP library
    // Handles common abbreviations
    const sentences: string[] = [];
    
    // Replace common abbreviations to avoid false splits
    let normalized = text
      .replace(/Mr\./g, 'Mr')
      .replace(/Mrs\./g, 'Mrs')
      .replace(/Dr\./g, 'Dr')
      .replace(/Ms\./g, 'Ms')
      .replace(/vs\./g, 'vs')
      .replace(/etc\./g, 'etc')
      .replace(/e\.g\./g, 'eg')
      .replace(/i\.e\./g, 'ie');

    // Split on sentence boundaries
    const parts = normalized.split(/([.!?]+[\s\n]+)/);
    
    let currentSentence = '';
    
    for (const part of parts) {
      if (/[.!?]+[\s\n]+/.test(part)) {
        currentSentence += part.trim();
        if (currentSentence.trim()) {
          sentences.push(currentSentence.trim());
        }
        currentSentence = '';
      } else {
        currentSentence += part;
      }
    }

    // Add any remaining content
    if (currentSentence.trim()) {
      sentences.push(currentSentence.trim());
    }

    return sentences.filter(s => s.length > 0);
  }
}

