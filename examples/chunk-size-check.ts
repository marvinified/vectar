/**
 * Check how chunkSize maps to actual token counts.
 *
 * Run with:
 *   yarn tsx examples/chunk-size-check.ts
 */

import { Voctar, chunking } from '../index';
import { readFileSync } from 'fs';
import { join } from 'path';
import { countTokens } from '../src/chunking/utils/tokenizer';
import type {
  EmbeddingProvider,
  EmbedOptions,
  SearchOptions,
  SearchResult,
  VectorPoint,
  VectorStoreProvider,
} from '../src/types';
import type { ChunkingOptions } from '../src/chunking/types';

const CHUNK_SIZE = 1000;
const OVERLAP_TOKENS = 200;
const OVERLAP_UNITS = 1;

const longArticle = readFileSync(join(__dirname, 'long-document.txt'), 'utf8').trim();

const embedScenarios: Array<{
  label: string;
  options: Required<Pick<EmbedOptions, 'chunkStrategy' | 'chunkOverlap'>>;
}> = [
  {
    label: 'recursive',
    options: {
      chunkStrategy: 'recursive',
      chunkOverlap: OVERLAP_TOKENS,
    },
  },
  {
    label: 'fixed',
    options: {
      chunkStrategy: 'fixed',
      chunkOverlap: OVERLAP_TOKENS,
    },
  },
  {
    label: 'sentence',
    options: {
      chunkStrategy: 'sentence',
      chunkOverlap: OVERLAP_UNITS,
    },
  },
  {
    label: 'paragraph',
    options: {
      chunkStrategy: 'paragraph',
      chunkOverlap: OVERLAP_UNITS,
    },
  },
  {
    label: 'semantic',
    options: {
      chunkStrategy: 'semantic',
      chunkOverlap: OVERLAP_TOKENS,
    },
  },
];

function reportChunks(label: string, options: ChunkingOptions, text: string): void {
  const result = chunking.chunkDocument(text, options, `${label}-example`);

  console.log(`\n${label}`);
  console.log('='.repeat(label.length));
  console.log(`options: ${JSON.stringify(options)}`);
  console.log(`chunks: ${result.chunks.length}`);

  result.chunks.forEach((chunk, index) => {
    const tokens = countTokens(chunk.text);
    const status = tokens <= CHUNK_SIZE ? 'ok' : 'too large';
    console.log(
      `chunk ${index}: ${tokens} tokens, ${chunk.text.length} chars (${status})`
    );
  });
}

class CountingEmbeddingProvider implements EmbeddingProvider {
  public embeddedTexts: string[] = [];

  async embed(text: string): Promise<number[]> {
    this.embeddedTexts.push(text);
    return [1];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    this.embeddedTexts.push(...texts);
    return texts.map(() => [1]);
  }

  getDimension(): number {
    return 1;
  }

  getModelName(): string {
    return 'text-embedding-3-small';
  }

  getTokenLimit(): number {
    return 8192;
  }
}

class RecordingVectorStore implements VectorStoreProvider {
  public points: VectorPoint[] = [];

  async ensureCollection(): Promise<void> {
    return undefined;
  }

  async upsert(_collection: string, points: VectorPoint[]): Promise<void> {
    this.points.push(...points);
  }

  async search(
    _collection: string,
    _vector: number[],
    _options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    return [];
  }

  async delete(): Promise<void> {
    return undefined;
  }

  async deleteCollection(): Promise<void> {
    this.points = [];
  }

  async getIdsByFilter(): Promise<string[]> {
    return [];
  }
}

async function reportEmbedPath(text: string): Promise<void> {
  console.log('\n.embed() path');
  console.log('=============');

  for (const scenario of embedScenarios) {
    const embeddingProvider = new CountingEmbeddingProvider();
    const storeProvider = new RecordingVectorStore();
    const vector = new Voctar({
      embedding: {
        type: 'custom',
        provider: embeddingProvider,
      },
      store: {
        type: 'custom',
        provider: storeProvider,
      },
    });

    await vector.embed('chunk-check', text, {
      documentId: `embed-path-${scenario.label}`,
      chunkSize: CHUNK_SIZE,
      chunkStrategy: scenario.options.chunkStrategy,
      chunkOverlap: scenario.options.chunkOverlap,
    });

    console.log(`\n${scenario.label}`);
    console.log('-'.repeat(scenario.label.length));
    console.log(`options: ${JSON.stringify(scenario.options)}`);
    console.log(`embedded texts: ${embeddingProvider.embeddedTexts.length}`);
    embeddingProvider.embeddedTexts.forEach((embeddedText, index) => {
      console.log(
        `embedded ${index}: ${countTokens(embeddedText)} tokens, ${embeddedText.length} chars`
      );
    });

    console.log(`stored points: ${storeProvider.points.length}`);
    storeProvider.points.forEach((point, index) => {
      const storedText = String(point.payload?.text ?? '');
      console.log(
        `stored ${index}: ${countTokens(storedText)} tokens, ${storedText.length} chars`
      );
    });
  }
}

async function main() {
  const text = longArticle;
  const totalTokens = countTokens(text);

  console.log('Input source: examples/long-document.txt');
  console.log(`Input: ${totalTokens} tokens, ${text.length} chars`);
  console.log(`Requested chunk size / hard limit: ${CHUNK_SIZE} tokens`);
  console.log(`Token overlap: ${OVERLAP_TOKENS}`);
  console.log(`Sentence/paragraph overlap units: ${OVERLAP_UNITS}`);

  reportChunks(
    'recursive strategy',
    {
      strategy: 'recursive',
      maxChunkSize: CHUNK_SIZE,
      overlap: OVERLAP_TOKENS,
    },
    text
  );

  reportChunks(
    'fixed strategy',
    {
      strategy: 'fixed',
      maxChunkSize: CHUNK_SIZE,
      overlap: OVERLAP_TOKENS,
    },
    text
  );

  reportChunks(
    'sentence strategy',
    {
      strategy: 'sentence',
      maxChunkSize: CHUNK_SIZE,
      overlap: OVERLAP_UNITS,
    },
    text
  );

  reportChunks(
    'paragraph strategy',
    {
      strategy: 'paragraph',
      maxChunkSize: CHUNK_SIZE,
      overlap: OVERLAP_UNITS,
    },
    text
  );

  reportChunks(
    'semantic strategy',
    {
      strategy: 'semantic',
      // softLimit: 800,
      // hardLimit: CHUNK_SIZE,
      maxChunkSize: CHUNK_SIZE,
      smartOverlap: false,
    },
    text
  );

  await reportEmbedPath(text);
}

if (require.main === module) {
  main();
}

