// Semantic chunking strategy - intelligent chunking based on meaning
import { v4 as uuidv4 } from 'uuid';
import type { Chunk, ChunkingOptions, ChunkingStrategy } from '../types';
import type { EmbeddingProvider } from '../../types';
import { countTokens } from '../utils/tokenizer';

interface Atom {
  text: string;
  startChar: number;
  endChar: number;
  type: 'turn' | 'paragraph' | 'sentence';
  role?: 'user' | 'agent' | 'tool';
  embedding?: number[];
}

interface ChunkHeader {
  summary?: string;
  facts?: string[];
  refs?: string[]; // IDs of chunks this depends on
}

interface SemanticChunkMetadata {
  header?: ChunkHeader;
  dependsOn?: string[];
  topicVolatility?: number;
  roles?: string[]; // Unique roles in this chunk
}

export interface SemanticChunkingOptions extends ChunkingOptions {
  // Embedding provider for semantic similarity
  embeddingProvider?: EmbeddingProvider;
  
  // Token limits
  softLimit?: number; // 700-900 tokens - try semantic merging
  hardLimit?: number; // 1000-1200 tokens - force cut
  
  // Semantic similarity threshold (0-1)
  similarityThreshold?: number; // 0.70-0.80
  
  // Content type
  contentType?: 'conversation' | 'text';
  
  // Overlap config
  contextOverlapPercent?: number; // 10-15%
  smartOverlap?: boolean; // Only overlap if semantically relevant
  
  // Topic volatility window
  volatilityWindow?: number; // Number of recent atoms to track
  
  // Generate headers
  generateHeaders?: boolean;
  headerGenerator?: (text: string) => Promise<ChunkHeader>;
  
  // Noise filtering
  stripNoise?: boolean;
  noisePatterns?: RegExp[];
  
  // Preserve formatting
  addRoleMarkers?: boolean;
}

export class SemanticChunkingStrategy implements ChunkingStrategy {
  getName(): string {
    return 'semantic';
  }

  chunk(text: string, documentId: string, options: ChunkingOptions): Chunk[] {
    const opts = options as SemanticChunkingOptions;
    
    // Get token limit from options or use defaults
    const tokenLimit = (opts as any).tokenLimit ?? 8192;
    const maxChunkSize = opts.maxChunkSize ?? 1000;
    
    // Set defaults - ensure soft/hard limits don't exceed token limit
    const softLimit = Math.min(opts.softLimit ?? 800, tokenLimit);
    const hardLimit = Math.min(opts.hardLimit ?? Math.min(maxChunkSize, tokenLimit), tokenLimit);
    const similarityThreshold = opts.similarityThreshold ?? 0.75;
    const contextOverlapPercent = opts.contextOverlapPercent ?? 0.12; // 12%
    const smartOverlap = opts.smartOverlap ?? true;
    const volatilityWindow = opts.volatilityWindow ?? 5;
    const generateHeaders = opts.generateHeaders ?? false;
    const stripNoise = opts.stripNoise ?? false;
    const addRoleMarkers = opts.addRoleMarkers ?? true;

    // Auto-detect content type if not specified
    const contentType = opts.contentType ?? this.detectContentType(text);

    // Step 1: Pre-segment into atoms
    const atoms = this.preSegment(text, contentType, stripNoise, opts.noisePatterns);
    
    if (atoms.length === 0) {
      return [];
    }

    // Step 2: Semantic merging with embeddings (if provider available)
    const chunks = this.semanticMerge(
      atoms,
      softLimit,
      hardLimit,
      similarityThreshold,
      volatilityWindow,
      opts.embeddingProvider
    );

    // Step 3: Apply smart overlap
    const chunksWithOverlap = smartOverlap 
      ? this.applySmartOverlap(chunks, contextOverlapPercent, opts.embeddingProvider)
      : chunks;

    // Step 4: Convert to Chunk objects with metadata and validate token limits
    const results: Chunk[] = [];
    let currentChunkIndex = 0;
    
    for (let i = 0; i < chunksWithOverlap.length; i++) {
      const chunk = chunksWithOverlap[i];
      let chunkText = chunk.text;

      // Add role markers if needed
      if (addRoleMarkers && chunk.atoms) {
        chunkText = this.addRoleMarkers(chunk.atoms);
      }

      // Validate token count and split if necessary
      const chunkTokens = this.estimateTokens(chunkText);
      
      if (chunkTokens > hardLimit) {
        // This chunk exceeds the limit (likely due to overlap or role markers)
        // Split it using recursive chunking as a fallback
        const safeChunkSize = Math.floor(hardLimit * 0.9); // Use 90% for safety
        
        // Simple recursive split by sentences/paragraphs
        const subChunks = this.splitOversizedChunk(chunkText, safeChunkSize, hardLimit);
        
        for (let j = 0; j < subChunks.length; j++) {
          const subChunkText = subChunks[j];
          
          const header: ChunkHeader | undefined = generateHeaders 
            ? this.generateSimpleHeader(subChunkText)
            : undefined;

          const metadata: any = {
            documentId,
            chunkIndex: currentChunkIndex++,
            totalChunks: chunksWithOverlap.length + subChunks.length - 1, // Will be updated later
            startChar: chunk.startChar + (j > 0 ? subChunks.slice(0, j).join('').length : 0),
            endChar: chunk.startChar + subChunks.slice(0, j + 1).join('').length,
            header,
            dependsOn: chunk.dependsOn,
            topicVolatility: chunk.volatility,
            roles: chunk.roles,
            _isSubChunk: true,
            _parentChunkIndex: i,
            ...opts.metadata,
          };

          results.push({
            id: uuidv4(),
            text: subChunkText,
            metadata,
          });
        }
      } else {
        // Generate header if requested (Note: async not supported in sync chunk method)
        // Headers would need to be generated separately or use cached embeddings
        const header: ChunkHeader | undefined = generateHeaders 
          ? this.generateSimpleHeader(chunkText)
          : undefined;

        const metadata: any = {
          documentId,
          chunkIndex: currentChunkIndex++,
          totalChunks: chunksWithOverlap.length, // Will be updated later
          startChar: chunk.startChar,
          endChar: chunk.endChar,
          header,
          dependsOn: chunk.dependsOn,
          topicVolatility: chunk.volatility,
          roles: chunk.roles,
          ...opts.metadata,
        };

        results.push({
          id: uuidv4(),
          text: chunkText,
          metadata,
        });
      }
    }

    // Update totalChunks for all chunks
    results.forEach(chunk => {
      chunk.metadata.totalChunks = results.length;
    });

    return results;
  }

  /**
   * Auto-detect if text is conversational based on role markers
   */
  private detectContentType(text: string): 'conversation' | 'text' {
    const lines = text.split('\n');
    let conversationMarkers = 0;
    
    // Check first 20 lines for conversation markers
    const sampleLines = lines.slice(0, 20);
    
    for (const line of sampleLines) {
      const trimmed = line.trim();
      // Look for role markers at start of line
      if (
        /^(u|user|a|agent|assistant|tool|t|speaker\d+|system):/i.test(trimmed)
      ) {
        conversationMarkers++;
      }
    }
    
    // If 30% or more lines have conversation markers, treat as conversation
    const threshold = sampleLines.length * 0.3;
    return conversationMarkers >= threshold ? 'conversation' : 'text';
  }

  /**
   * Pre-segment text into atomic units (turns, paragraphs, sentences)
   */
  private preSegment(
    text: string,
    contentType: 'conversation' | 'text',
    stripNoise: boolean,
    noisePatterns?: RegExp[]
  ): Atom[] {
    if (contentType === 'conversation') {
      return this.segmentConversation(text, stripNoise, noisePatterns);
    } else {
      return this.segmentText(text, stripNoise, noisePatterns);
    }
  }

  /**
   * Segment conversation into turns (user/agent/tool)
   */
  private segmentConversation(text: string, stripNoise: boolean, noisePatterns?: RegExp[]): Atom[] {
    const atoms: Atom[] = [];
    const lines = text.split('\n');
    
    let currentTurn = '';
    let currentRole: 'user' | 'agent' | 'tool' | undefined;
    let startChar = 0;
    let currentStart = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Detect role markers
      let role: 'user' | 'agent' | 'tool' | undefined;
      let content = trimmed;

      if (trimmed.startsWith('u:') || trimmed.startsWith('user:')) {
        role = 'user';
        content = trimmed.replace(/^u:|^user:/i, '').trim();
      } else if (trimmed.startsWith('a:') || trimmed.startsWith('agent:') || trimmed.startsWith('assistant:')) {
        role = 'agent';
        content = trimmed.replace(/^a:|^agent:|^assistant:/i, '').trim();
      } else if (trimmed.startsWith('tool:') || trimmed.startsWith('t:')) {
        role = 'tool';
        content = trimmed.replace(/^tool:|^t:/i, '').trim();
      }

      // If we detected a new role and have accumulated content, save it
      if (role && currentTurn) {
        const cleaned = stripNoise ? this.stripNoise(currentTurn, noisePatterns) : currentTurn;
        if (cleaned.trim()) {
          atoms.push({
            text: cleaned,
            startChar: currentStart,
            endChar: startChar,
            type: 'turn',
            role: currentRole,
          });
        }
        currentTurn = content;
        currentRole = role;
        currentStart = startChar;
      } else if (role) {
        // Start new turn
        currentTurn = content;
        currentRole = role;
        currentStart = startChar;
      } else {
        // Continue current turn
        currentTurn += (currentTurn ? '\n' : '') + trimmed;
      }

      startChar += line.length + 1; // +1 for newline
    }

    // Add final turn
    if (currentTurn.trim()) {
      const cleaned = stripNoise ? this.stripNoise(currentTurn, noisePatterns) : currentTurn;
      if (cleaned.trim()) {
        atoms.push({
          text: cleaned,
          startChar: currentStart,
          endChar: startChar,
          type: 'turn',
          role: currentRole,
        });
      }
    }

    return atoms;
  }

  /**
   * Segment plain text into paragraphs and sentences
   */
  private segmentText(text: string, stripNoise: boolean, noisePatterns?: RegExp[]): Atom[] {
    const atoms: Atom[] = [];
    
    // Split into paragraphs
    const paragraphs = text.split(/\n\s*\n/);
    let startChar = 0;

    for (const para of paragraphs) {
      const paraText = para.trim();
      if (!paraText) {
        startChar += para.length + 2; // +2 for \n\n
        continue;
      }

      // Split paragraph into sentences
      const sentences = this.splitIntoSentences(paraText);
      
      for (const sentence of sentences) {
        const cleaned = stripNoise ? this.stripNoise(sentence, noisePatterns) : sentence;
        if (cleaned.trim()) {
          const endChar = startChar + sentence.length;
          atoms.push({
            text: cleaned,
            startChar,
            endChar,
            type: 'sentence',
          });
          startChar = endChar;
        } else {
          startChar += sentence.length;
        }
      }

      startChar += 2; // For paragraph break
    }

    return atoms;
  }

  /**
   * Semantic merging with soft/hard limits
   */
  private semanticMerge(
    atoms: Atom[],
    softLimit: number,
    hardLimit: number,
    similarityThreshold: number,
    volatilityWindow: number,
    embeddingProvider?: EmbeddingProvider
  ): Array<{
    text: string;
    startChar: number;
    endChar: number;
    atoms?: Atom[];
    volatility?: number;
    dependsOn?: string[];
    roles?: string[];
  }> {
    const chunks: Array<any> = [];
    let currentChunk: Atom[] = [];
    let currentTokens = 0;
    let recentEmbeddings: number[][] = [];
    const chunkIds: string[] = [];

    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      const atomTokens = this.estimateTokens(atom.text);

      // If a single atom exceeds hard limit, we need to split it
      if (atomTokens > hardLimit) {
        // Finalize current chunk if it exists
        if (currentChunk.length > 0) {
          const chunkId = uuidv4();
          chunkIds.push(chunkId);
          chunks.push(this.finalizeChunk(currentChunk, chunkId));
          currentChunk = [];
          currentTokens = 0;
        }
        
        // Split the oversized atom using recursive strategy
        // Note: This is a simplified split - the final validation will catch any remaining issues
        const atomChunks = this.splitOversizedAtom(atom, hardLimit);
        for (const atomChunk of atomChunks) {
          const chunkId = uuidv4();
          chunkIds.push(chunkId);
          chunks.push({
            id: chunkId,
            text: atomChunk.text,
            startChar: atomChunk.startChar,
            endChar: atomChunk.endChar,
            atoms: [atomChunk],
            volatility: 0,
            roles: atom.role ? [atom.role] : [],
            dependsOn: [],
          });
        }
        recentEmbeddings = [];
        continue;
      }

      // Check hard limit
      if (currentTokens + atomTokens > hardLimit && currentChunk.length > 0) {
        // Force cut
        const chunkId = uuidv4();
        chunkIds.push(chunkId);
        chunks.push(this.finalizeChunk(currentChunk, chunkId));
        currentChunk = [atom];
        currentTokens = atomTokens;
        recentEmbeddings = [];
        continue;
      }

      // Check soft limit - try semantic merging
      if (currentTokens + atomTokens > softLimit && currentChunk.length > 0) {
        // Use lexical similarity (embeddings would require async)
        const lexicalSimilarity = this.computeLexicalSimilarity(
          currentChunk.map(a => a.text).join(' '),
          atom.text
        );

        if (lexicalSimilarity < similarityThreshold) {
          const chunkId = uuidv4();
          chunkIds.push(chunkId);
          chunks.push(this.finalizeChunk(currentChunk, chunkId));
          currentChunk = [atom];
          currentTokens = atomTokens;
          recentEmbeddings = [];
          continue;
        }
      }

      // Add atom to current chunk
      currentChunk.push(atom);
      currentTokens += atomTokens;

      // Track volatility (simplified without actual embeddings)
      if (recentEmbeddings.length >= volatilityWindow) {
        recentEmbeddings.shift();
      }
    }

    // Add final chunk
    if (currentChunk.length > 0) {
      const chunkId = uuidv4();
      chunkIds.push(chunkId);
      chunks.push(this.finalizeChunk(currentChunk, chunkId));
    }

    return chunks;
  }

  /**
   * Finalize chunk from atoms
   */
  private finalizeChunk(atoms: Atom[], id?: string): any {
    const text = atoms.map(a => a.text).join('\n');
    const startChar = atoms[0].startChar;
    const endChar = atoms[atoms.length - 1].endChar;
    const roles = [...new Set(atoms.map(a => a.role).filter(Boolean))];
    
    // Calculate topic volatility (simplified)
    const volatility = this.calculateVolatility(atoms);

    return {
      id,
      text,
      startChar,
      endChar,
      atoms,
      volatility,
      roles,
      dependsOn: [],
    };
  }

  /**
   * Calculate topic volatility (simplified - uses lexical changes)
   */
  private calculateVolatility(atoms: Atom[]): number {
    if (atoms.length < 2) return 0;

    let totalDissimilarity = 0;
    for (let i = 1; i < atoms.length; i++) {
      const similarity = this.computeLexicalSimilarity(atoms[i - 1].text, atoms[i].text);
      totalDissimilarity += (1 - similarity);
    }

    return totalDissimilarity / (atoms.length - 1);
  }

  /**
   * Apply smart overlap between chunks
   */
  private applySmartOverlap(
    chunks: any[],
    overlapPercent: number,
    embeddingProvider?: EmbeddingProvider
  ): any[] {
    if (chunks.length < 2) return chunks;

    const result = [...chunks];

    for (let i = 1; i < result.length; i++) {
      const prevChunk = result[i - 1];
      const currentChunk = result[i];

      // Get trailing atoms from previous chunk
      const overlapSize = Math.ceil(prevChunk.atoms.length * overlapPercent);
      const trailingAtoms = prevChunk.atoms.slice(-overlapSize);

      if (trailingAtoms.length === 0) continue;

      // Check if overlap is semantically relevant
      const overlapText = trailingAtoms.map((a: Atom) => a.text).join('\n');
      const similarity = this.computeLexicalSimilarity(
        overlapText,
        currentChunk.atoms[0]?.text || ''
      );

      // Only add overlap if it's relevant (similarity above threshold)
      if (similarity > 0.3) {
        currentChunk.text = overlapText + '\n---\n' + currentChunk.text;
        currentChunk.dependsOn = currentChunk.dependsOn || [];
        if (prevChunk.id) {
          currentChunk.dependsOn.push(prevChunk.id);
        }
      }
    }

    return result;
  }

  /**
   * Add role markers to text
   */
  private addRoleMarkers(atoms: Atom[]): string {
    return atoms
      .map(atom => {
        if (atom.role) {
          return `${atom.role}: ${atom.text}`;
        }
        return atom.text;
      })
      .join('\n\n');
  }

  /**
   * Generate simple header (synchronous version)
   */
  private generateSimpleHeader(text: string): ChunkHeader {
    // Extract first sentence as summary
    const sentences = this.splitIntoSentences(text);
    const summary = sentences[0]?.substring(0, 200) || '';

    // Extract potential facts (dates, numbers, entities)
    const facts = this.extractFacts(text);

    return { summary, facts };
  }

  /**
   * Extract facts from text (dates, numbers, key entities)
   */
  private extractFacts(text: string): string[] {
    const facts: string[] = [];

    // Extract dates
    const dateRegex = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g;
    const dates = text.match(dateRegex);
    if (dates) facts.push(...dates);

    // Extract IDs or references
    const idRegex = /\b[A-Z]{2,}-\d+\b|\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi;
    const ids = text.match(idRegex);
    if (ids) facts.push(...ids.slice(0, 5)); // Limit to 5

    // Extract key numbers with context
    const numberRegex = /\$\d+(?:,\d{3})*(?:\.\d{2})?|\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:days?|hours?|minutes?|users?|items?|percent|%)/gi;
    const numbers = text.match(numberRegex);
    if (numbers) facts.push(...numbers.slice(0, 5));

    return [...new Set(facts)].slice(0, 10); // Max 10 unique facts
  }

  /**
   * Strip noise from text
   */
  private stripNoise(text: string, customPatterns?: RegExp[]): string {
    let cleaned = text;

    // Default noise patterns
    const defaultPatterns = [
      /\b(thanks|thank you|lol|haha|hmm|uh|um)\b/gi,
      /^[\s\-_]+$/gm, // Empty lines with just whitespace/dashes
      /\[signature\].*$/gi,
      /^--+\s*$/gm, // Signature separators
    ];

    const patterns = [...defaultPatterns, ...(customPatterns || [])];

    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    return cleaned.replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * Compute lexical similarity (Jaccard similarity on words)
   */
  private computeLexicalSimilarity(text1: string, text2: string): number {
    const words1 = new Set(
      text1.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2)
    );
    
    const words2 = new Set(
      text2.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2)
    );

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }


  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitter
    return text
      .replace(/([.!?]+)\s+/g, '$1\n')
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Estimate token count using accurate tokenizer
   */
  private estimateTokens(text: string): number {
    return countTokens(text);
  }

  /**
   * Split an oversized atom (turn, paragraph, or sentence)
   */
  private splitOversizedAtom(atom: Atom, hardLimit: number): Array<{ text: string; startChar: number; endChar: number }> {
    const chunks: Array<{ text: string; startChar: number; endChar: number }> = [];
    const safeLimit = Math.floor(hardLimit * 0.9);
    
    // Split by sentences if it's a paragraph or turn
    const sentences = this.splitIntoSentences(atom.text);
    let currentText = '';
    let currentStart = atom.startChar;
    let currentTokens = 0;
    let textOffset = 0; // Track position in original text
    
    for (const sentence of sentences) {
      const sentTokens = countTokens(sentence);
      
      if (currentTokens + sentTokens > safeLimit && currentText) {
        chunks.push({
          text: currentText.trim(),
          startChar: currentStart,
          endChar: atom.startChar + textOffset,
        });
        currentStart = atom.startChar + textOffset;
        currentText = sentence;
        currentTokens = sentTokens;
        textOffset += currentText.length + 1; // +1 for space
      } else {
        currentText += (currentText ? ' ' : '') + sentence;
        currentTokens += sentTokens;
        textOffset += sentence.length + (currentText.includes(sentence + ' ') ? 1 : 0);
      }
    }
    
    if (currentText) {
      chunks.push({
        text: currentText.trim(),
        startChar: currentStart,
        endChar: atom.endChar,
      });
    }
    
    return chunks.length > 0 ? chunks : [{ text: atom.text, startChar: atom.startChar, endChar: atom.endChar }];
  }

  /**
   * Split an oversized chunk using simple recursive splitting
   */
  private splitOversizedChunk(text: string, maxTokens: number, hardLimit: number): string[] {
    const chunks: string[] = [];
    
    // Try splitting by paragraphs first
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    let currentChunk = '';
    let currentTokens = 0;
    
    for (const para of paragraphs) {
      const paraTokens = countTokens(para);
      
      if (currentTokens + paraTokens > maxTokens && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = para;
        currentTokens = paraTokens;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + para;
        currentTokens += paraTokens;
      }
    }
    
    if (currentChunk) {
      // If remaining chunk still exceeds limit, split by sentences
      const finalTokens = countTokens(currentChunk);
      if (finalTokens > hardLimit) {
        const sentences = this.splitIntoSentences(currentChunk);
        let sentenceChunk = '';
        let sentenceTokens = 0;
        
        for (const sentence of sentences) {
          const sentTokens = countTokens(sentence);
          
          if (sentenceTokens + sentTokens > maxTokens && sentenceChunk) {
            chunks.push(sentenceChunk.trim());
            sentenceChunk = sentence;
            sentenceTokens = sentTokens;
          } else {
            sentenceChunk += (sentenceChunk ? ' ' : '') + sentence;
            sentenceTokens += sentTokens;
          }
        }
        
        if (sentenceChunk) {
          chunks.push(sentenceChunk.trim());
        }
      } else {
        chunks.push(currentChunk.trim());
      }
    }
    
    return chunks.filter(c => c.length > 0);
  }
}

