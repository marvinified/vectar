// Token counting utility for chunking strategies
// Uses tiktoken for accurate token counting
import { encoding_for_model } from 'tiktoken';

// Cache encoding to avoid recreating it
let cachedEncoding: ReturnType<typeof encoding_for_model> | null = null;

/**
 * Get the encoding for embedding models
 * OpenAI embedding models use cl100k_base encoding
 */
function getEmbeddingEncoding() {
  if (!cachedEncoding) {
    // Use cl100k_base encoding which is used by text-embedding-3 models
    // This is compatible with GPT-4 and text-embedding-3 models
    cachedEncoding = encoding_for_model('gpt-4');
  }
  return cachedEncoding;
}

/**
 * Count tokens in text accurately using tiktoken
 */
export function countTokens(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }
  
  try {
    const encoding = getEmbeddingEncoding();
    return encoding.encode(text).length;
  } catch (error) {
    // Fallback to approximation if tiktoken fails
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }
}

/**
 * Estimate tokens (fallback method)
 * Use this only if tiktoken is not available
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }
  // Rough approximation: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
}

