/**
 * Basic chunking example (minimal output)
 */

import { Voctar, chunking } from '../index';
import { readFileSync } from 'fs';
import { join } from 'path';

const longArticle = readFileSync(join(__dirname, 'long-document.txt'), 'utf8').trim();

async function main() {
  // 1) Chunk count (direct chunking API)
  const basicResult = chunking.chunkDocument(longArticle, {
    strategy: 'recursive',
    maxChunkSize: 500,
    overlap: 100,
  });
  console.log(`Recursive chunks: ${basicResult.chunks.length}`);

  // 2) Quick strategy comparison (count only)
  const strategies = ['fixed', 'recursive', 'sentence', 'paragraph'] as const;
  for (const strategy of strategies) {
    const result = chunking.chunkDocument(longArticle, {
      strategy,
      maxChunkSize: 800,
      overlap: 150,
    });
    console.log(`${strategy} chunks: ${result.chunks.length}`);
  }

  // 3) Embed + search (chunk count + retrieved text with score)

  if (!process.env.OPENAI_API_KEY) {
    console.log('Set OPENAI_API_KEY to run embedding search');
    return;
  }
  const vector = new Voctar({
    embedding: {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
    },
    store: {
      type: 'memory',
    },
  });

  const { chunkIds } = await vector.embed(
    'articles',
    longArticle,
    {
      chunkStrategy: 'paragraph',
      chunkSize: 1000,
      chunkOverlap: 150,
      metadata: {
        title: 'AI and ML in 2025',
        category: 'technology',
      },
    }
  );

  console.log(`Embedded chunks: ${chunkIds.length}`);
  const results = await vector.search('articles', 'vector databases', {
    limit: 2,
    scoreThreshold: 0,
  });

  const retrievedText = results
    .map(
      (result, index) =>
        `Result ${index + 1} (score: ${result.score.toFixed(3)}):\n${result.text.substring(0, 220)}...`
    )
    .join('\n\n---\n\n');

  console.log('\nRetrieved text:\n');
  console.log(retrievedText || '(no results)');
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}

export { main };

