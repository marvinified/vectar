/**
 * Voctar Store Performance Comparison
 * 
 * Tests retrieval speed across different vector store providers:
 * - SQLite (file-based)
 * - SQLite (in-memory)
 * - InMemory (pure memory)
 * - Qdrant (if configured)
 * 
 * Run with: tsx libs/vector/examples/performance-comparison.ts
 */

import { Voctar } from '../index';
import { OpenAIEmbeddingProvider } from '../providers/embeddings/openai';
import { SQLiteVectorStoreProvider } from '../providers/stores/sqlite';
import { InMemoryVectorStoreProvider } from '../providers/stores/memory';
import { QdrantVectorStoreProvider } from '../providers/stores/qdrant';

const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  EMBEDDING_DIMENSION: process.env.EMBEDDING_DIMENSION
    ? Number(process.env.EMBEDDING_DIMENSION)
    : undefined,
  QDRANT_URL: process.env.QDRANT_URL,
  QDRANT_PORT: process.env.QDRANT_PORT ? Number(process.env.QDRANT_PORT) : undefined,
  QDRANT_API_KEY: process.env.QDRANT_API_KEY,
};

// Test data - various document sizes and types
const testDocuments = {
  small: [
    'Machine learning is a subset of artificial intelligence.',
    'Vector databases enable semantic search capabilities.',
    'Embeddings represent text as numerical vectors.',
    'Similarity search finds relevant documents by meaning.',
    'Chunking breaks large documents into manageable pieces.',
  ],
  
  medium: [
    `Artificial Intelligence and Machine Learning Fundamentals

Artificial Intelligence (AI) represents one of the most transformative technologies of our time. It encompasses a broad range of techniques and approaches designed to enable machines to perform tasks that typically require human intelligence.

Machine Learning (ML) is a subset of AI that focuses on algorithms and statistical models that enable computer systems to improve their performance on a specific task through experience, without being explicitly programmed for every scenario.

The field has evolved significantly over the past decades, moving from rule-based systems to sophisticated neural networks capable of processing vast amounts of data and making complex decisions.

Key areas of application include natural language processing, computer vision, robotics, and predictive analytics. These technologies are now integrated into everyday products and services, from recommendation systems to autonomous vehicles.`,

    `Vector Databases: The Foundation of Modern AI Search

Vector databases have emerged as a critical infrastructure component for AI applications that require semantic search capabilities. Unlike traditional databases that rely on exact matches and keyword searches, vector databases store and retrieve data based on semantic similarity.

The core concept revolves around embeddings - dense vector representations of data that capture semantic meaning. When text, images, or other data types are converted into embeddings, similar items cluster together in the high-dimensional vector space.

This enables powerful search capabilities where users can find relevant information by meaning rather than exact keywords. For example, searching for "automobile" would also return results about "car" or "vehicle" because these concepts are semantically similar.

Modern vector databases use sophisticated algorithms like HNSW (Hierarchical Navigable Small World) graphs and IVF (Inverted File Index) to enable fast approximate nearest neighbor search at scale.`,

    `The Evolution of Natural Language Processing

Natural Language Processing (NLP) has undergone a remarkable transformation with the advent of transformer architectures and large language models. The field has moved from simple rule-based systems to sophisticated neural networks capable of understanding context, nuance, and even subtle linguistic patterns.

Early NLP systems relied heavily on statistical methods and hand-crafted features. These approaches, while effective for specific tasks, struggled with the complexity and ambiguity inherent in human language. The introduction of word embeddings like Word2Vec and GloVe provided a foundation for more sophisticated approaches.

The transformer architecture, introduced in 2017, revolutionized the field by enabling parallel processing of sequences and capturing long-range dependencies more effectively than previous architectures. This breakthrough paved the way for large language models that can perform a wide variety of language tasks with remarkable proficiency.

Today's language models can generate coherent text, answer questions, translate between languages, summarize documents, and even engage in complex reasoning tasks. The key to their success lies in their ability to learn patterns from vast amounts of text data and apply this knowledge to new situations.`,
  ],

  large: [
    `Comprehensive Guide to Vector Embeddings and Semantic Search

Introduction to Vector Embeddings

Vector embeddings represent a fundamental shift in how we approach information retrieval and similarity matching in computer systems. At their core, embeddings are dense numerical representations that capture the semantic meaning of data in a high-dimensional space. This transformation enables mathematical operations on concepts, allowing us to measure similarity, perform clustering, and conduct semantic search operations.

The concept of embeddings builds upon the idea that similar items should have similar representations. When text, images, audio, or other data types are converted into embeddings, semantically related items cluster together in the vector space. This clustering enables powerful applications like recommendation systems, content discovery, and intelligent search.

Modern embedding models, particularly those based on transformer architectures, can capture complex relationships and nuances in data. They understand context, synonyms, and even subtle semantic differences that would be difficult to encode in traditional keyword-based systems.

Types of Embeddings

Text embeddings are perhaps the most common and well-studied type of embeddings. They convert textual content into numerical vectors that preserve semantic meaning. Modern text embedding models can handle multiple languages, understand context, and even capture emotional tone or sentiment.

Image embeddings transform visual content into vector representations. These embeddings can capture visual features, styles, and even semantic content depicted in images. They enable applications like reverse image search, visual similarity matching, and content-based image retrieval.

Multimodal embeddings combine different types of data into unified vector representations. For example, they can embed both text and images together, enabling applications that can search across different media types using a single query.

Audio embeddings convert sound data into vector representations, capturing acoustic features, speech patterns, and even semantic content in audio. These embeddings power applications like voice search, audio similarity matching, and speech recognition systems.

Applications in Production Systems

Vector embeddings power many production systems across various industries. E-commerce platforms use embeddings to recommend products based on user preferences and browsing history. The embeddings capture both explicit preferences and implicit behavioral patterns.

Content platforms leverage embeddings for content discovery and recommendation. By understanding the semantic content of articles, videos, or other media, these systems can suggest relevant content to users even when they can't articulate exactly what they're looking for.

Search engines have evolved beyond keyword matching to incorporate semantic understanding. Modern search systems use embeddings to understand query intent and match it with relevant content, even when the exact keywords don't appear in the target documents.

Customer service systems use embeddings to match user queries with relevant knowledge base articles or to route inquiries to appropriate support agents. The semantic understanding enables more accurate matching and better user experiences.

Technical Implementation Considerations

Implementing vector embeddings in production systems requires careful consideration of several technical factors. Performance is critical, as embedding generation and similarity search operations can be computationally expensive. Optimizing these operations often involves trade-offs between accuracy and speed.

Scalability is another important consideration. As the number of embeddings grows, the computational cost of similarity search increases. Vector databases and specialized search algorithms help address these scalability challenges.

Data quality significantly impacts embedding performance. Clean, well-structured data produces better embeddings than noisy or inconsistent data. Preprocessing and data cleaning steps are often essential for optimal results.

Model selection is crucial for achieving good performance. Different embedding models excel at different tasks and data types. Choosing the right model involves considering factors like data domain, language, and specific use case requirements.

Future Directions and Emerging Trends

The field of vector embeddings continues to evolve rapidly. New architectures and training methods are constantly being developed to improve embedding quality and efficiency. Multimodal embeddings that can handle different types of data in a unified framework are becoming increasingly important.

Real-time embedding generation and updates are becoming more feasible as computational resources become more accessible. This enables dynamic systems that can adapt to changing data and user preferences.

Privacy-preserving embedding techniques are emerging to address concerns about data security and user privacy. These techniques allow systems to benefit from embeddings while protecting sensitive information.

Integration with large language models is opening new possibilities for embedding-based applications. The combination of powerful language understanding with efficient similarity search creates opportunities for more sophisticated AI systems.`,
  ],
};

// Performance metrics interface
interface PerformanceMetrics {
  provider: string;
  embeddingTime: number;
  searchTime: number;
  totalTime: number;
  documentsProcessed: number;
  averageEmbeddingTime: number;
  averageSearchTime: number;
  memoryUsage?: number;
  errors: string[];
}

// Test configuration
interface TestConfig {
  collectionName: string;
  searchQueries: string[];
  iterations: number;
  warmupRuns: number;
}

class PerformanceTester {
  private config: TestConfig;
  private results: PerformanceMetrics[] = [];

  constructor(config: TestConfig) {
    this.config = config;
  }

  async runPerformanceTest(): Promise<void> {
    if (!process.env.OPENAI_API_KEY) {
      console.log('Set OPENAI_API_KEY to run performance comparison');
      return;
    }

    // Test different providers
    const providers = await this.getAvailableProviders();
    
    for (const provider of providers) {
      try {
        const metrics = await this.testProvider(provider);
        this.results.push(metrics);
        this.printProviderResults(metrics);
      } catch (error) {
        console.error(`Error testing ${provider.name}:`, error);
        this.results.push({
          provider: provider.name,
          embeddingTime: 0,
          searchTime: 0,
          totalTime: 0,
          documentsProcessed: 0,
          averageEmbeddingTime: 0,
          averageSearchTime: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        });
      }
    }

    // Print comparison table
    this.printComparisonTable();
    
    // Cleanup
    await this.cleanup();
  }

  private async getAvailableProviders() {
    const providers: Array<{ name: string; service: Voctar }> = [];
    
    // Always include SQLite providers
    providers.push(
      {
        name: 'SQLite (File)',
        service: new Voctar({
          embeddingProvider: new OpenAIEmbeddingProvider({
            apiKey: env.OPENAI_API_KEY,
            model: env.EMBEDDING_MODEL,
            dimension: env.EMBEDDING_DIMENSION,
          }),
          vectorStoreProvider: new SQLiteVectorStoreProvider({
            path: './test_performance.db',
            inMemory: false,
          }),
        }),
      },
      {
        name: 'SQLite (Memory)',
        service: new Voctar({
          embeddingProvider: new OpenAIEmbeddingProvider({
            apiKey: env.OPENAI_API_KEY,
            model: env.EMBEDDING_MODEL,
            dimension: env.EMBEDDING_DIMENSION,
          }),
          vectorStoreProvider: new SQLiteVectorStoreProvider({
            path: ':memory:',
            inMemory: true,
          }),
        }),
      },
      {
        name: 'InMemory',
        service: new Voctar({
          embeddingProvider: new OpenAIEmbeddingProvider({
            apiKey: env.OPENAI_API_KEY,
            model: env.EMBEDDING_MODEL,
            dimension: env.EMBEDDING_DIMENSION,
          }),
          vectorStoreProvider: new InMemoryVectorStoreProvider(),
        }),
      }
    );

    // Add Qdrant if configured
    if (env.QDRANT_URL) {
      providers.push({
        name: 'Qdrant',
        service: new Voctar({
          embeddingProvider: new OpenAIEmbeddingProvider({
            apiKey: env.OPENAI_API_KEY,
            model: env.EMBEDDING_MODEL,
            dimension: env.EMBEDDING_DIMENSION,
          }),
          vectorStoreProvider: new QdrantVectorStoreProvider({
            url: env.QDRANT_URL,
            port: env.QDRANT_PORT,
            apiKey: env.QDRANT_API_KEY || undefined, // Allow undefined for anonymous access
            timeout: 10000, // Shorter timeout for performance testing
            checkCompatibility: false, // Disable version compatibility check
          }),
        }),
      });
    }

    return providers;
  }

  private async testProvider(provider: { name: string; service: Voctar }): Promise<PerformanceMetrics> {
    const { service } = provider;
    const errors: string[] = [];
    let totalEmbeddingTime = 0;
    let totalSearchTime = 0;
    let documentsProcessed = 0;

    try {
      // Ensure collection exists
      await service.ensureCollection(this.config.collectionName);

      // Warmup runs
      for (let i = 0; i < this.config.warmupRuns; i++) {
        try {
          await service.embed(this.config.collectionName, 'Warmup document for performance testing');
          await service.search(this.config.collectionName, 'warmup query');
        } catch (error) {
          // Ignore warmup errors
        }
      }

      // Clear collection after warmup
      await service.deleteCollection(this.config.collectionName);
      await service.ensureCollection(this.config.collectionName);
    } catch (error) {
      errors.push(`Setup error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        provider: provider.name,
        embeddingTime: 0,
        searchTime: 0,
        totalTime: 0,
        documentsProcessed: 0,
        averageEmbeddingTime: 0,
        averageSearchTime: 0,
        errors,
      };
    }

    // Test embedding performance
    const embeddingStart = Date.now();

    for (const [size, documents] of Object.entries(testDocuments)) {
      for (const document of documents) {
        try {
          const docStart = Date.now();
          await service.embed(this.config.collectionName, document, {
            metadata: { size, timestamp: Date.now() },
            chunkSize: 1000,
            chunkStrategy: 'recursive',
          });
          const docTime = Date.now() - docStart;
          totalEmbeddingTime += docTime;
          documentsProcessed++;
        } catch (error) {
          errors.push(`Embedding error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    const embeddingTime = Date.now() - embeddingStart;

    // Test search performance
    const searchStart = Date.now();

    for (let i = 0; i < this.config.iterations; i++) {
      for (const query of this.config.searchQueries) {
        try {
          const queryStart = Date.now();
          await service.search(this.config.collectionName, query, {
            limit: 5,
            scoreThreshold: 0.3,
          });
          const queryTime = Date.now() - queryStart;
          totalSearchTime += queryTime;
        } catch (error) {
          errors.push(`Search error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    const searchTime = Date.now() - searchStart;
    const totalTime = embeddingTime + searchTime;

    return {
      provider: provider.name,
      embeddingTime,
      searchTime,
      totalTime,
      documentsProcessed,
      averageEmbeddingTime: totalEmbeddingTime / documentsProcessed,
      averageSearchTime: totalSearchTime / (this.config.iterations * this.config.searchQueries.length),
      errors,
    };
  }

  private printProviderResults(metrics: PerformanceMetrics): void {
    console.log(
      `${metrics.provider}: total=${metrics.totalTime}ms, embed=${metrics.averageEmbeddingTime.toFixed(2)}ms/doc, search=${metrics.averageSearchTime.toFixed(2)}ms/query, errors=${metrics.errors.length}`
    );
  }

  private printComparisonTable(): void {
    // Sort by total time (ascending - fastest first)
    const sortedResults = [...this.results].sort((a, b) => a.totalTime - b.totalTime);

    console.log('\nRank | Provider           | Total | Avg Embed | Avg Search | Errors');
    console.log('------------------------------------------------------------------');
    
    sortedResults.forEach((result, index) => {
      const rank = (index + 1).toString().padStart(4);
      const provider = result.provider.padEnd(18);
      const totalTime = result.totalTime.toString().padStart(5);
      const avgEmbed = result.averageEmbeddingTime.toFixed(1).padStart(9);
      const avgSearch = result.averageSearchTime.toFixed(1).padStart(10);
      const errors = result.errors.length.toString().padStart(6);

      console.log(`${rank} | ${provider} | ${totalTime}ms | ${avgEmbed}ms | ${avgSearch}ms | ${errors}`);
    });
  }

  private async cleanup(): Promise<void> {
    // Clean up file-based SQLite database
    try {
      const fs = require('fs');
      if (fs.existsSync('./test_performance.db')) {
        fs.unlinkSync('./test_performance.db');
      }
    } catch (error) {
      console.log('Could not remove test_performance.db');
    }

    // Clean up Qdrant collection if it was created
    if (env.QDRANT_URL) {
      try {
        const qdrantService = new Voctar({
          embeddingProvider: new OpenAIEmbeddingProvider({
            apiKey: env.OPENAI_API_KEY,
            model: env.EMBEDDING_MODEL,
            dimension: env.EMBEDDING_DIMENSION,
          }),
          vectorStoreProvider: new QdrantVectorStoreProvider({
            url: env.QDRANT_URL,
            port: env.QDRANT_PORT,
            apiKey: env.QDRANT_API_KEY || undefined,
            timeout: 5000,
            checkCompatibility: false,
          }),
        });
        
        await qdrantService.deleteCollection(this.config.collectionName);
      } catch (error) {
        console.log('Could not clean up Qdrant collection');
      }
    }
  }
}

// Main execution
async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.log('Set OPENAI_API_KEY to run performance comparison');
    return;
  }

  const config: TestConfig = {
    collectionName: 'performance_test',
    searchQueries: [
      'artificial intelligence machine learning',
      'vector databases semantic search',
      'natural language processing transformers',
      'embeddings similarity matching',
      'neural networks deep learning',
    ],
    iterations: 2, // Number of search iterations per query
    warmupRuns: 1, // Warmup runs before actual testing
  };

  const tester = new PerformanceTester(config);
  await tester.runPerformanceTest();
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Performance test failed:', error);
    process.exit(1);
  });
}

export { main, PerformanceTester };
