// Paragraph-based chunking strategy
import { v4 as uuidv4 } from 'uuid';
import type { Chunk, ChunkingOptions, ChunkingStrategy } from '../types';
import { countTokens } from '../utils/tokenizer';

export class ParagraphChunkingStrategy implements ChunkingStrategy {
  getName(): string {
    return 'paragraph';
  }

  chunk(text: string, documentId: string, options: ChunkingOptions): Chunk[] {
    // Get token limit and ensure maxSize doesn't exceed it
    const tokenLimit = (options as any).tokenLimit ?? 8192;
    const maxSize = Math.min(options.maxChunkSize ?? 2000, tokenLimit);
    const overlap = options.overlap ?? 1; // Overlap in number of paragraphs

    // Split text into paragraphs
    const paragraphs = text
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const chunks: Chunk[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;
    let chunkIndex = 0;
    let startChar = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      const paragraphTokens = countTokens(paragraph);

      // If adding this paragraph would exceed maxSize (in tokens) and we have content, create a chunk
      if (currentTokens + paragraphTokens > maxSize && currentChunk.length > 0) {
        const chunkText = currentChunk.join('\n\n').trim();
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
            paragraphs: currentChunk.length,
            ...options.metadata,
          },
        });

        // Keep last N paragraphs for overlap
        const overlapParagraphs = currentChunk.slice(-overlap);
        currentChunk = [...overlapParagraphs, paragraph];
        currentTokens = countTokens(overlapParagraphs.join('\n\n')) + paragraphTokens;
        startChar = endChar - (overlapParagraphs.join('\n\n').length);
        chunkIndex++;
      } else {
        currentChunk.push(paragraph);
        currentTokens += paragraphTokens;
      }
    }

    // Add remaining content as final chunk
    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join('\n\n').trim();
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
          paragraphs: currentChunk.length,
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
}

