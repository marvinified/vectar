/**
 * Semantic chunking example (minimal output)
 */

import { Vectar, chunking } from '../index';
import { readFileSync } from 'fs';
import { join } from 'path';

// Sample conversation
const supportConversation = `
u: Hi, I'm having trouble accessing my account. I keep getting an error message.
a: I'd be happy to help you with that. What error message are you seeing?
u: It says "Invalid credentials" but I'm sure my password is correct.
a: Let me check your account. Can you provide your email address?
u: Sure, it's sarah.johnson@example.com
tool: User account found - ID: USER-12345, Last login: 2025-01-10, Status: Active
a: Thank you. I can see your account is active. Let's try resetting your password. I'm sending you a password reset email now.
u: Okay, I'll check my inbox.
tool: Password reset email sent to sarah.johnson@example.com at 2025-01-15 10:23:45
a: The email has been sent. Please check your inbox and spam folder. The link will expire in 1 hour.
u: Got it! I just received the email. Let me try resetting it now.
u: It worked! I'm able to log in now. Thank you so much!
a: Wonderful! I'm glad we could resolve that quickly. Is there anything else I can help you with today?
u: No, that's all. Thanks again for your help!
a: You're very welcome! Have a great day, Sarah.
`;

// Sample technical discussion
const technicalDiscussion = `
user: We need to implement rate limiting on our API. What's the best approach?
developer: I'd recommend using a token bucket algorithm. It's flexible and handles burst traffic well.
user: How does the token bucket work exactly?
developer: Tokens are added to a bucket at a fixed rate. Each request consumes a token. When the bucket is empty, requests are rejected or queued. You can configure the bucket size and refill rate.
user: What about Redis for storing the token counts?
developer: Redis is perfect for this. It's fast, has atomic operations, and supports TTL for automatic cleanup. Here's a basic implementation:
tool: Code example - redis.incr('rate_limit:user_123'), redis.expire('rate_limit:user_123', 60)
developer: This increments the counter and sets a 60-second expiry. You'd check if the count exceeds your limit before processing the request.
user: What limits would you recommend for our API?
developer: For authenticated users, I'd suggest 1000 requests per hour with a burst allowance of 50 requests per minute. For unauthenticated, 100 per hour with 10 per minute burst.
architect: Don't forget to add proper error responses. Return 429 status with Retry-After header.
developer: Good point. Also implement exponential backoff on the client side.
user: Should we rate limit per endpoint or globally?
architect: Start global, then add per-endpoint limits for expensive operations like file uploads or report generation.
developer: Agreed. We can use Redis hash structures to track both global and per-endpoint counters efficiently.
user: Great! Can someone create a ticket for this with the technical specs?
tool: Created ticket BACKEND-456 - "Implement API rate limiting with Redis token bucket"
architect: I'll add the technical specs to the ticket. Let's aim to have this in the next sprint.
`;

const articleText = readFileSync(join(__dirname, 'long-document.txt'), 'utf8').trim();

async function main() {
  // 1) Chunk counts only
  const supportSemantic = chunking.chunkDocument(supportConversation, {
    strategy: 'semantic',
    softLimit: 700,
    hardLimit: 1000,
    generateHeaders: true,
  });
  console.log(`Support conversation semantic chunks: ${supportSemantic.chunks.length}`);

  const technicalSemantic = chunking.chunkDocument(technicalDiscussion, {
    strategy: 'semantic',
    softLimit: 700,
    hardLimit: 1000,
    generateHeaders: true,
  });
  console.log(`Technical discussion semantic chunks: ${technicalSemantic.chunks.length}`);

  const articleSemantic = chunking.chunkDocument(articleText, {
    strategy: 'semantic',
    softLimit: 1000,
    hardLimit: 1500,
    generateHeaders: true,
  });
  console.log(`Article semantic chunks: ${articleSemantic.chunks.length}`);

  // 2) Quick strategy comparison
  const recursiveSupport = chunking.chunkDocument(supportConversation, {
    strategy: 'recursive',
    maxChunkSize: 800,
    overlap: 150,
  });
  console.log(`Support recursive chunks: ${recursiveSupport.chunks.length}`);

  if (!process.env.OPENAI_API_KEY) {
    console.log('Set OPENAI_API_KEY to run embedding search');
    return;
  }
  const vector = new Vectar({
    embedding: {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
    },
    store: {
      type: 'memory',
    },
  });

  // 3) Embed + search (chunk count + retrieved text with score)
  const { chunkIds } = await vector.embed(
    'support_tickets',
    supportConversation,
    {
      chunkStrategy: 'semantic',
      chunkSize: 800, // Soft limit
      metadata: {
        ticketId: 'SUPPORT-12345',
        customerId: 'sarah.johnson@example.com',
        status: 'resolved',
        category: 'account_access',
      },
    }
  );

  console.log(`Embedded chunks: ${chunkIds.length}`);
  const results = await vector.search('support_tickets', 'password reset', {
    limit: 2,
    scoreThreshold: 0,
  });

  const retrievedText = results
    .map(
      (result, index) =>
        `Result ${index + 1} (score: ${result.score.toFixed(3)}):\n${result.text.substring(0, 220).replace(/\n/g, ' ')}...`
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

