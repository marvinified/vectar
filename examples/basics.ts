/**
 * Simple Vectar Example
 * Minimal flow: embed -> chunk count -> retrieve text
 */

import { Vectar } from '../index';
import { readFileSync } from 'fs';
import { join } from 'path';

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.log('Set OPENAI_API_KEY to run this example');
    return;
  }

  // Initialize the vector instance
  const vector = new Vectar({
    embedding: {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
    },
    store: {
      type: 'memory',
    },
  });

  // Read the long text from the field
  const longText = readFileSync(join(__dirname, 'long-document.txt'), 'utf8').trim();

  try {
    // Embed the long text into the vector instance
    const { chunkIds } = await vector.embed(
      'example_collection',
      longText,
      {
        documentId: 'vector-intro',
        metadata: {
          title: 'Artificial Intelligence and Machine Learning in 2025',
          category: 'example',
        },
        chunkSize: 500,
      }
    );

    console.log(`Chunks created: ${chunkIds.length}`);

    // Search for the text in the vector instance
    const results = await vector.search(
      'example_collection',
      'What do teams now prioritize?',
      { limit: 2 }
    );

    // Retrieve text with score from the results
    const retrievedText = results
      .map(
        (result, index) =>
          `Result ${index + 1} (score: ${result.score.toFixed(3)}):\n${result.text.substring(0, 220)}...`
      )
      .join('\n\n---\n\n');
    console.log('\nRetrieved text:\n');
    console.log(retrievedText || '(no results)');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { main };

