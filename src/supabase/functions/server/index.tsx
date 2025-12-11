import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { performComparison } from './comparison.tsx';

const app = new Hono();

app.use('*', cors());
app.use('*', logger(console.log));

// In-memory cache for Figma API responses (lasts for server lifetime)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Global rate limiter
let lastFigmaApiCall = 0;
const MIN_API_CALL_INTERVAL = 3000; // 3 seconds

class RateLimitError extends Error {
  retryAfter: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfterMs;
  }
}

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastFigmaApiCall;

  if (timeSinceLastCall < MIN_API_CALL_INTERVAL) {
    const waitTime = MIN_API_CALL_INTERVAL - timeSinceLastCall;
    console.log(`Rate limit protection: waiting ${waitTime}ms`);
    await delay(waitTime);
  }

  lastFigmaApiCall = Date.now();
}

async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CACHE_TTL
): Promise<T> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    console.log('Cache hit for:', key);
    return cached.data as T;
  }

  console.log('Cache miss for:', key);
  const data = await fetcher();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  initialDelay: number = 2000
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (error instanceof RateLimitError) {
        // Use the server-provided wait time, or fall back to exponential backoff if invalid (< 1s)
        let waitTime = error.retryAfter;
        if (waitTime < 1000) {
          waitTime = initialDelay * Math.pow(2, i);
        }

        console.log(`Rate limit hit (explicit), waiting ${waitTime}ms (attempt ${i + 1}/${maxRetries})...`);
        await delay(waitTime);
        continue;
      }

      if (error instanceof Error && error.message.includes('429')) {
        const delayMs = initialDelay * Math.pow(2, i);
        console.log(`Rate limit hit (429), waiting ${delayMs}ms (attempt ${i + 1}/${maxRetries})...`);
        await delay(delayMs);
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

const api = new Hono();

// Health check
api.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// Compare UI endpoint
api.post('/compare-ui', async (c) => {
  try {
    // Parse request body
    const { figmaUrl, websiteUrl, screenshot, dimensions, figmaImageUrl: providedFigmaImageUrl } = await c.req.json();

    if (!figmaUrl || !websiteUrl) {
      return c.json({ error: 'Missing figmaUrl or websiteUrl' }, 400);
    }

    console.log('Starting UI comparison:', { figmaUrl, websiteUrl });

    // Parse Figma URL
    const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);
    if (!fileKey || !nodeId) {
      return c.json({ error: 'Invalid Figma URL format' }, 400);
    }

    // Get Figma access token
    const figmaToken = 'figd_z38f7Cm6-QCwUyp5r7Cn9wzFdXyP8x416hKKIEcs';
    if (!figmaToken) {
      return c.json({ error: 'Figma access token not configured' }, 500);
    }

    // Debug: Check token format (without exposing the full token)
    const tokenPrefix = figmaToken.substring(0, 8);
    const tokenLength = figmaToken.length;
    console.log(`Using Figma token: ${tokenPrefix}... (length: ${tokenLength})`);

    if (tokenLength < 20) {
      return c.json({
        error: 'Figma access token appears to be invalid',
        details: 'Token is too short. Please generate a new token from Figma settings.'
      }, 500);
    }

    let frameDimensions = dimensions;

    // Fetch Figma frame data if dimensions not provided
    if (!frameDimensions) {
      console.log('Fetching Figma frame metadata...');
      const frameData = await getCached(
        `frame-data-${fileKey}-${nodeId}`,
        () => fetchFigmaFrameData(fileKey, nodeId, figmaToken)
      );
      frameDimensions = frameData.dimensions;

      // Add delay between API calls if we just fetched data
      await delay(1000);
    } else {
      console.log('Using provided dimensions:', frameDimensions);
    }

    // Export Figma frame as image (if not provided in payload)
    let finalFigmaImageUrl = providedFigmaImageUrl;

    if (!finalFigmaImageUrl) {
      console.log('Exporting Figma frame as image...');
      finalFigmaImageUrl = await getCached(
        `figma-image-${fileKey}-${nodeId}`,
        () => exportFigmaImage(fileKey!, nodeId!, figmaToken)
      );
    } else {
      console.log('Using provided Figma image URL:', finalFigmaImageUrl);
    }

    console.log('Figma image exported:', finalFigmaImageUrl);

    // Perform comparison using Playwright, pixelmatch, and DOM analysis
    const result = await performComparison(
      websiteUrl,
      finalFigmaImageUrl,
      frameDimensions,
      fileKey,
      nodeId,
      screenshot // Pass client-side screenshot if available
    );

    return c.json(result);

  } catch (error) {
    console.error('Error in compare-ui endpoint:', error);
    return c.json(
      {
        error: 'Comparison failed',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// Figma metadata endpoint
api.post('/figma-metadata', async (c) => {
  try {
    const { figmaUrl } = await c.req.json();

    if (!figmaUrl) {
      return c.json({ error: 'Missing figmaUrl' }, 400);
    }

    // Parse Figma URL
    const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);
    if (!fileKey || !nodeId) {
      return c.json({ error: 'Invalid Figma URL format' }, 400);
    }

    // Get Figma access token
    const figmaToken = Deno.env.get('FIGMA_ACCESS_TOKEN');
    if (!figmaToken) {
      return c.json({ error: 'Figma access token not configured' }, 500);
    }

    // Fetch Figma frame data
    const frameData = await getCached(
      `frame-data-${fileKey}-${nodeId}`,
      () => fetchFigmaFrameData(fileKey, nodeId, figmaToken)
    );

    return c.json(frameData);

  } catch (error) {
    console.error('Error in figma-metadata endpoint:', error);
    return c.json(
      {
        error: 'Failed to fetch Figma metadata',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});

// Mount routes to multiple paths to handle Supabase routing quirks
app.route('/', api);
app.route('/make-server-70da446d', api);
app.route('/functions/v1/make-server-70da446d', api);

function parseFigmaUrl(urlStr: string): { fileKey: string | null; nodeId: string | null } {
  try {
    const url = new URL(urlStr);
    const pathParts = url.pathname.split('/');
    const fileKey = pathParts[2] || null;
    let nodeId = url.searchParams.get('node-id');

    if (nodeId) {
      nodeId = nodeId.replace(/-/g, ':');
    }

    return { fileKey, nodeId };
  } catch {
    return { fileKey: null, nodeId: null };
  }
}

async function fetchFigmaFrameData(
  fileKey: string,
  nodeId: string,
  token: string
): Promise<{ dimensions: { width: number; height: number } }> {

  try {
    await waitForRateLimit();

    console.log(`Fetching Figma node data for ${nodeId}...`);

    const response = await retryWithBackoff(async () => {
      const res = await fetch(
        `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
        {
          headers: {
            'X-Figma-Token': token,
          },
        }
      );

      if (!res.ok) {
        if (res.status === 429) {
          const retryAfterHeader = res.headers.get('Retry-After');
          // Retry-After can be seconds or a date. Figma usually sends seconds if at all.
          // If header is missing or parse fails, we'll throw a regular 429 error to trigger exponential backoff.
          if (retryAfterHeader) {
            const seconds = parseInt(retryAfterHeader, 10);
            if (!isNaN(seconds)) {
              throw new RateLimitError('Figma API rate limit exceeded', seconds * 1000);
            }
          }
          throw new Error(`Figma API error ${res.status}: Rate limit exceeded`);
        }

        const errorText = await res.text();
        if (res.status === 403) throw new Error('Figma API access denied');
        if (res.status === 404) throw new Error('Figma file or node not found');
        throw new Error(`Figma API error ${res.status}: ${errorText}`);
      }

      return res;
    });

    const data = await response.json();
    const node = data.nodes ? data.nodes[nodeId] : null;

    if (!node) {
      throw new Error(`Node ${nodeId} not found in Figma response.`);
    }

    if (!node.document) {
      throw new Error('Invalid node structure - no document property found.');
    }

    const bbox = node.document.absoluteBoundingBox;
    if (!bbox) {
      throw new Error('No bounding box found. Node must be a frame or component with absoluteBoundingBox.');
    }

    return {
      dimensions: {
        width: Math.round(bbox.width),
        height: Math.round(bbox.height),
      },
    };
  } catch (error) {
    console.error('Error fetching Figma frame data:', error);
    throw error;
  }
}

async function exportFigmaImage(
  fileKey: string,
  nodeId: string,
  token: string
): Promise<string> {
  try {
    await waitForRateLimit();

    console.log(`Exporting Figma image for node ${nodeId}...`);

    const response = await retryWithBackoff(async () => {
      const res = await fetch(
        `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=1`,
        {
          headers: {
            'X-Figma-Token': token,
          },
        }
      );

      if (!res.ok) {
        if (res.status === 429) {
          const retryAfterHeader = res.headers.get('Retry-After');
          if (retryAfterHeader) {
            const seconds = parseInt(retryAfterHeader, 10);
            if (!isNaN(seconds)) {
              throw new RateLimitError('Figma API rate limit exceeded', seconds * 1000);
            }
          }
          throw new Error(`Figma API error ${res.status}: Rate limit exceeded`);
        }

        const errorText = await res.text();
        console.error('Figma Images API error:', res.status, errorText);

        if (res.status === 403) {
          throw new Error('Figma API access denied. Please check your FIGMA_ACCESS_TOKEN.');
        } else if (res.status === 404) {
          throw new Error(`Figma file or node not found for image export.`);
        }

        throw new Error(`Figma Images API error ${res.status}: ${errorText}`);
      }

      return res;
    });

    const data = await response.json();
    console.log('Figma Images API response:', JSON.stringify(data, null, 2));

    const imageUrl = data.images[nodeId];

    if (!imageUrl) {
      throw new Error('No image URL returned from Figma API. The node might not be exportable.');
    }

    return imageUrl;
  } catch (error) {
    console.error('Error exporting Figma image:', error);
    throw error;
  }
}

Deno.serve(app.fetch);