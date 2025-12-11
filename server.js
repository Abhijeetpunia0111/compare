import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { Buffer } from 'node:buffer';
import dotenv from 'dotenv';
import fs from 'node:fs';

// Load environment variables
dotenv.config();

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Constants
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const MIN_API_CALL_INTERVAL = 3000; // 3 seconds

// In-memory cache
const cache = new Map();
let lastFigmaApiCall = 0;

// Rate Limit Error
class RateLimitError extends Error {
  constructor(message, retryAfterMs) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfterMs;
  }
}

// Helpers
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastCall = now - lastFigmaApiCall;

  if (timeSinceLastCall < MIN_API_CALL_INTERVAL) {
    const waitTime = MIN_API_CALL_INTERVAL - timeSinceLastCall;
    console.log(`Rate limit protection: waiting ${waitTime}ms`);
    await delay(waitTime);
  }

  lastFigmaApiCall = Date.now();
}

async function getCached(key, fetcher, ttl = CACHE_TTL) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    console.log('Cache hit for:', key);
    return cached.data;
  }

  console.log('Cache miss for:', key);
  const data = await fetcher();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}

async function retryWithBackoff(fn, maxRetries = 5, initialDelay = 2000) {
  let lastError = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (error instanceof RateLimitError) {
        let waitTime = error.retryAfter;
        if (waitTime < 1000) waitTime = initialDelay * Math.pow(2, i);
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

function parseFigmaUrl(urlStr) {
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

// Figma API Functions
async function fetchFigmaFrameData(fileKey, nodeId, token) {
  try {
    await waitForRateLimit();
    console.log(`Fetching Figma node data for ${nodeId}...`);

    const response = await retryWithBackoff(async () => {
      const res = await fetch(
        `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
        { headers: { 'X-Figma-Token': token } }
      );

      if (!res.ok) {
        if (res.status === 429) {
          const retryAfterHeader = res.headers.get('Retry-After');
          if (retryAfterHeader) {
            const seconds = parseInt(retryAfterHeader, 10);
            if (!isNaN(seconds)) throw new RateLimitError('Figma API rate limit exceeded', seconds * 1000);
          }
          throw new Error(`Figma API error ${res.status}: Rate limit exceeded`);
        }
        const errorText = await res.text();
        throw new Error(`Figma API error ${res.status}: ${errorText}`);
      }
      return res;
    });

    const data = await response.json();
    const node = data.nodes ? data.nodes[nodeId] : null;

    if (!node || !node.document || !node.document.absoluteBoundingBox) {
        throw new Error('Invalid node structure or no bounding box found.');
    }

    return {
      dimensions: {
        width: Math.round(node.document.absoluteBoundingBox.width),
        height: Math.round(node.document.absoluteBoundingBox.height),
      },
    };
  } catch (error) {
    console.error('Error fetching Figma frame data:', error);
    throw error;
  }
}

async function exportFigmaImage(fileKey, nodeId, token) {
  try {
    await waitForRateLimit();
    console.log(`Exporting Figma image for node ${nodeId}...`);

    const response = await retryWithBackoff(async () => {
      const res = await fetch(
        `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=1`,
        { headers: { 'X-Figma-Token': token } }
      );

      if (!res.ok) {
         if (res.status === 429) {
            const retryAfterHeader = res.headers.get('Retry-After');
            if (retryAfterHeader) {
                const seconds = parseInt(retryAfterHeader, 10);
                if (!isNaN(seconds)) throw new RateLimitError('Figma API rate limit exceeded', seconds * 1000);
            }
            throw new Error(`Figma API error ${res.status}: Rate limit exceeded`);
         }
         const errorText = await res.text();
         throw new Error(`Figma Images API error ${res.status}: ${errorText}`);
      }
      return res;
    });

    const data = await response.json();
    const imageUrl = data.images[nodeId];
    if (!imageUrl) throw new Error('No image URL returned from Figma API.');
    return imageUrl;
  } catch (error) {
    console.error('Error exporting Figma image:', error);
    throw error;
  }
}

// Comparison Logic
function resizeImage(png, targetWidth, targetHeight) {
  if (png.width === targetWidth && png.height === targetHeight) return png;

  const resized = new PNG({ width: targetWidth, height: targetHeight });
  const scaleX = png.width / targetWidth;
  const scaleY = png.height / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.floor(x * scaleX);
      const srcY = Math.floor(y * scaleY);
      const srcIdx = (srcY * png.width + srcX) * 4;
      const dstIdx = (y * targetWidth + x) * 4;

      resized.data[dstIdx] = png.data[srcIdx];
      resized.data[dstIdx + 1] = png.data[srcIdx + 1];
      resized.data[dstIdx + 2] = png.data[srcIdx + 2];
      resized.data[dstIdx + 3] = png.data[srcIdx + 3];
    }
  }
  return resized;
}

function analyzeImageDifferences(screenshot, figma, width, height, sensitivity = 3) {
    const issues = [];
    const BLOCK_SIZE = 20; // Block size for detection
    const blocksX = Math.ceil(width / BLOCK_SIZE);
    const blocksY = Math.ceil(height / BLOCK_SIZE);
    const activeBlocks = new Uint8Array(blocksX * blocksY);

    // Sensitivity Config
    // 1x (Low) -> 5x (High)
    const config = {
        1: { pixelDiffThreshold: 50, blockThreshold: 0.20, minArea: 500 },
        2: { pixelDiffThreshold: 35, blockThreshold: 0.10, minArea: 250 },
        3: { pixelDiffThreshold: 25, blockThreshold: 0.05, minArea: 100 }, // Default
        4: { pixelDiffThreshold: 15, blockThreshold: 0.02, minArea: 50 },
        5: { pixelDiffThreshold: 5,  blockThreshold: 0.01, minArea: 10 }
    }[sensitivity] || { pixelDiffThreshold: 25, blockThreshold: 0.05, minArea: 100 };

    console.log(`Analyzing with sensitivity ${sensitivity}x:`, config);

    // 1. Identify Active Blocks
    for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++) {
            const startX = bx * BLOCK_SIZE;
            const startY = by * BLOCK_SIZE;
            const endX = Math.min(startX + BLOCK_SIZE, width);
            const endY = Math.min(startY + BLOCK_SIZE, height);

            let diffPixels = 0;
            let totalPixels = 0;

            for (let y = startY; y < endY; y++) {
                const rowOffset = y * width;
                for (let x = startX; x < endX; x++) {
                    const idx = (rowOffset + x) * 4;
                    // Check bounds
                    if (idx + 2 >= screenshot.data.length) continue;

                    const rDiff = Math.abs(screenshot.data[idx] - figma.data[idx]);
                    const gDiff = Math.abs(screenshot.data[idx + 1] - figma.data[idx + 1]);
                    const bDiff = Math.abs(screenshot.data[idx + 2] - figma.data[idx + 2]);
                    const pixelDiff = (rDiff + gDiff + bDiff) / 3;
                    
                    if (pixelDiff > config.pixelDiffThreshold) { 
                         diffPixels++;
                    }
                    totalPixels++;
                }
            }

            // Threshold: if > X% of pixels in this block vary, mark it active
            if (totalPixels > 0 && (diffPixels / totalPixels) > config.blockThreshold) {
                activeBlocks[by * blocksX + bx] = 1;
            }
        }
    }

    // 2. Connected Components (Clustering)
    const visited = new Uint8Array(blocksX * blocksY);
    const clusters = [];

    for (let i = 0; i < blocksX * blocksY; i++) {
        if (activeBlocks[i] && !visited[i]) {
            const cluster = {
                minX: Infinity, minY: Infinity,
                maxX: -Infinity, maxY: -Infinity,
                blockCount: 0
            };
            
            const stack = [i];
            visited[i] = 1;

            while (stack.length > 0) {
                const currIdx = stack.pop();
                const cx = currIdx % blocksX;
                const cy = Math.floor(currIdx / blocksX);

                cluster.minX = Math.min(cluster.minX, cx);
                cluster.minY = Math.min(cluster.minY, cy);
                cluster.maxX = Math.max(cluster.maxX, cx);
                cluster.maxY = Math.max(cluster.maxY, cy);
                cluster.blockCount++;

                const neighbors = [
                    { nx: cx + 1, ny: cy }, // Right
                    { nx: cx - 1, ny: cy }, // Left
                    { nx: cx, ny: cy + 1 }, // Down
                    { nx: cx, ny: cy - 1 }  // Up
                ];

                for (const n of neighbors) {
                    if (n.nx >= 0 && n.nx < blocksX && n.ny >= 0 && n.ny < blocksY) {
                         const nIdx = n.ny * blocksX + n.nx;
                         if (activeBlocks[nIdx] && !visited[nIdx]) {
                             visited[nIdx] = 1;
                             stack.push(nIdx);
                         }
                    }
                }
            }
            clusters.push(cluster);
        }
    }

    // 3. Generate Issues
    clusters.forEach((cluster, index) => {
        if (cluster.blockCount < 1) return; 

        const x = cluster.minX * BLOCK_SIZE;
        const y = cluster.minY * BLOCK_SIZE;
        const w = (cluster.maxX - cluster.minX + 1) * BLOCK_SIZE;
        const h = (cluster.maxY - cluster.minY + 1) * BLOCK_SIZE;

        const finalX = Math.max(0, x);
        const finalY = Math.max(0, y);
        const finalW = Math.min(w, width - finalX);
        const finalH = Math.min(h, height - finalY);

        let severity = 'Low';
        let type = 'Layout';
        const area = finalW * finalH;

        // Skip issues smaller than minArea
        if (area < config.minArea) return;

        // Heuristics for classification
        if (area > 50000) {
            severity = 'High';
        } else if (area > 10000) {
            severity = 'Medium';
        }

        if (area < 1000) {
             type = 'Color'; 
        }

        issues.push({
            id: `diff-cluster-${index}`,
            type: type,
            message: `Difference detected in ${finalW}x${finalH} region`,
            severity,
            region: {
                x: finalX,
                y: finalY,
                width: finalW,
                height: finalH
            }
        });
    });

    // Return top 20 biggest issues
    return issues.sort((a, b) => {
         const sevScore = { High: 3, Medium: 2, Low: 1 };
         if (sevScore[a.severity] !== sevScore[b.severity]) {
             return sevScore[b.severity] - sevScore[a.severity];
         }
         return (b.region.width * b.region.height) - (a.region.width * a.region.height);
    }).slice(0, 20);
  }

async function performComparison(websiteUrl, figmaImageUrl, dimensions, screenshotBase64, sensitivity = 3) {
    if (!screenshotBase64) {
        throw new Error("Client-side screenshot is required for local comparison.");
    }

    // 1. Prepare Screenshot
    if (!screenshotBase64) throw new Error('Screenshot is missing/empty');
    console.log(`Screenshot base64 length: ${screenshotBase64.length}`);
    const cleanBase64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
    const screenshotBuffer = Buffer.from(cleanBase64, 'base64');
    console.log(`Screenshot buffer size: ${screenshotBuffer.length}`);
    
    // Check for PNG or JPEG signature in screenshot
    let screenshotPng;
    if (screenshotBuffer.length > 0 && screenshotBuffer[0] === 0xFF && screenshotBuffer[1] === 0xD8) {
        console.log("Detected JPEG input, decoding...");
        const rawJpeg = jpeg.decode(screenshotBuffer, { useTArray: true }); // Returns Uint8Array data (rgba)
        // Convert to PNG object structure for consistency
        screenshotPng = {
            width: rawJpeg.width,
            height: rawJpeg.height,
            data: rawJpeg.data
        };
    } else {
        if (screenshotBuffer.length > 0 && screenshotBuffer[0] !== 0x89) {
             console.warn("Screenshot buffer does not start with PNG signature!");
             console.log("First bytes:", screenshotBuffer.subarray(0, 16).toString('hex'));
        }
        screenshotPng = PNG.sync.read(screenshotBuffer);
    }

    // 2. Download Figma Image
    console.log(`Downloading Figma image from: ${figmaImageUrl}`);
    const figmaResponse = await fetch(figmaImageUrl);
    if (!figmaResponse.ok) throw new Error(`Failed to download Figma image: ${figmaResponse.status}`);
    
    const contentType = figmaResponse.headers.get('content-type');
    console.log(`Figma image content-type: ${contentType}`);
    
    const figmaArrayBuffer = await figmaResponse.arrayBuffer();
    const figmaBuffer = Buffer.from(figmaArrayBuffer);
    console.log(`Figma buffer size: ${figmaBuffer.length}`);
    
    // Check for PNG signature in Figma image
    if (figmaBuffer.length > 0 && figmaBuffer[0] !== 0x89) {
         console.warn("Figma buffer does not start with PNG signature!");
         console.log("First bytes:", figmaBuffer.subarray(0, 100).toString()); // Log as string to see if it's text
    }

    const figmaPng = PNG.sync.read(figmaBuffer);

    // 3. Match Dimensions
    const width = Math.min(screenshotPng.width, figmaPng.width, dimensions.width);
    const height = Math.min(screenshotPng.height, figmaPng.height, dimensions.height);
    console.log(`Comparing images at ${width}x${height}...`);

    const resizedScreenshot = resizeImage(screenshotPng, width, height);
    const resizedFigma = resizeImage(figmaPng, width, height);

    // 4. Pixelmatch
    // Sensitivity map for pixelmatch threshold (0 to 1)
    // Smaller values = More sensitive (stricter matching)
    // 1x (Low) -> 0.9 (Very loose)
    // 5x (High) -> 0.1 (Very strict)
    const pixelmatchThreshold = {
        1: 0.9,
        2: 0.7,
        3: 0.5, // Standard
        4: 0.3,
        5: 0.1 
    }[sensitivity] || 0.5;

    const diffPng = new PNG({ width, height });
    const diffPixels = pixelmatch(
        resizedScreenshot.data,
        resizedFigma.data,
        diffPng.data,
        width,
        height,
        { threshold: pixelmatchThreshold }
    );

    const diffScore = diffPixels / (width * height);
    console.log(`Diff score: ${(diffScore * 100).toFixed(2)}% (Threshold: ${pixelmatchThreshold})`);

    // 5. Analyze
    const issues = analyzeImageDifferences(resizedScreenshot, resizedFigma, width, height, sensitivity);

    // 6. Return Base64 Images (No Supabase Storage)
    const diffBuffer = PNG.sync.write(diffPng);
    
    // We can just return the Figma buffer as base64 too, or reuse the URL if we want. 
    // Usually local usage is fine with Data URLs.
    
    return {
        figmaImageUrl: `data:image/png;base64,${figmaBuffer.toString('base64')}`,
        screenshotUrl: `data:image/png;base64,${screenshotBuffer.toString('base64')}`,
        diffImageUrl: `data:image/png;base64,${diffBuffer.toString('base64')}`,
        diffScore,
        resolution: { width, height },
        issues,
    };
}


// --- Routes ---

app.get('/health', (c) => c.json({ status: 'ok' }));

app.post('/figma-metadata', async (c) => {
    try {
        const { figmaUrl } = await c.req.json();
        if (!figmaUrl) return c.json({ error: 'Missing figmaUrl' }, 400);

        const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);
        if (!fileKey || !nodeId) return c.json({ error: 'Invalid Figma URL' }, 400);

        const token = process.env.FIGMA_ACCESS_TOKEN;
        if (!token) return c.json({ error: 'FIGMA_ACCESS_TOKEN not configured in .env' }, 500);

        const frameData = await getCached(
            `frame-data-${fileKey}-${nodeId}`,
            () => fetchFigmaFrameData(fileKey, nodeId, token)
        );

        return c.json(frameData);
    } catch (error) {
        console.error('Error in figma-metadata:', error);
        return c.json({ error: 'Failed to fetch metadata', details: error.message }, 500);
    }
});

app.post('/compare-ui', async (c) => {
    try {
        const { figmaUrl, websiteUrl, screenshot, dimensions, figmaImageUrl: providedFigmaImageUrl, sensitivity } = await c.req.json();

        if (!figmaUrl || !websiteUrl) return c.json({ error: 'Missing logic' }, 400);

        const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);
        const token = process.env.FIGMA_ACCESS_TOKEN;

        let frameDimensions = dimensions;
        if (!frameDimensions) {
             const frameData = await getCached(
                `frame-data-${fileKey}-${nodeId}`,
                () => fetchFigmaFrameData(fileKey, nodeId, token)
             );
             frameDimensions = frameData.dimensions;
        }

        let finalFigmaImageUrl = providedFigmaImageUrl;
        if (!finalFigmaImageUrl) {
            finalFigmaImageUrl = await getCached(
                `figma-image-${fileKey}-${nodeId}`,
                () => exportFigmaImage(fileKey, nodeId, token)
            );
        }
        console.log("Here*************",finalFigmaImageUrl)
        const result = await performComparison(
            websiteUrl,
            finalFigmaImageUrl,
            frameDimensions,
            screenshot, // Must be provided
            sensitivity || 3
        );

        return c.json(result);

    } catch (error) {
        console.error('Error in compare-ui:', error);
        return c.json({ error: 'Comparison failed', details: error.message }, 500);
    }
});

const port = process.env.PORT || 3001;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port: Number(port)
});

