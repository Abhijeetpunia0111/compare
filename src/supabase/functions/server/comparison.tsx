import pixelmatch from 'npm:pixelmatch@6.0.0';
import { PNG } from 'npm:pngjs@7.0.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Buffer } from 'node:buffer';

interface ComparisonResult {
  figmaImageUrl: string;
  screenshotUrl: string;
  diffImageUrl: string;
  diffScore: number;
  resolution: { width: number; height: number };
  issues: Array<{
    id: string;
    type: string;
    message: string;
    severity: string;
    region: { x: number; y: number; width: number; height: number };
  }>;
}

export async function performComparison(
  websiteUrl: string,
  figmaImageUrl: string,
  dimensions: { width: number; height: number },
  fileKey: string,
  nodeId: string,
  screenshotBase64?: string
): Promise<ComparisonResult> {
  console.log('Starting comparison process...');

  try {
    let screenshotBuffer: Uint8Array;

    // 1. Get screenshot (either provided or captured)
    if (screenshotBase64) {
      console.log('Using provided client-side screenshot...');
      // Remove data URL prefix if present
      const cleanBase64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
      screenshotBuffer = new Uint8Array(Buffer.from(cleanBase64, 'base64'));
    } else {
      console.log(`Capturing screenshot of ${websiteUrl}...`);
      screenshotBuffer = await captureScreenshot(websiteUrl, dimensions);
    }

    // 2. Download Figma image
    console.log('Downloading Figma image...');
    const figmaResponse = await fetch(figmaImageUrl);
    if (!figmaResponse.ok) {
      throw new Error(`Failed to download Figma image: ${figmaResponse.status}`);
    }
    const figmaArrayBuffer = await figmaResponse.arrayBuffer();
    const figmaBuffer = new Uint8Array(figmaArrayBuffer);

    // 3. Parse both images with PNG
    console.log('Parsing images...');
    const screenshotPng = PNG.sync.read(Buffer.from(screenshotBuffer));
    const figmaPng = PNG.sync.read(Buffer.from(figmaBuffer));

    // Ensure both images have the same dimensions
    const width = Math.min(screenshotPng.width, figmaPng.width, dimensions.width);
    const height = Math.min(screenshotPng.height, figmaPng.height, dimensions.height);

    console.log(`Comparing images at ${width}x${height}...`);

    // Resize images if needed to match dimensions
    const resizedScreenshot = resizeImage(screenshotPng, width, height);
    const resizedFigma = resizeImage(figmaPng, width, height);

    // 4. Run pixelmatch comparison
    const diffPng = new PNG({ width, height });
    const diffPixels = pixelmatch(
      resizedScreenshot.data,
      resizedFigma.data,
      diffPng.data,
      width,
      height,
      { threshold: 0.1 }
    );

    const diffScore = diffPixels / (width * height);
    console.log(`Diff score: ${(diffScore * 100).toFixed(2)}%`);

    // 5. Analyze images for semantic issues
    console.log('Analyzing semantic issues...');
    const issues = analyzeImageDifferences(resizedScreenshot, resizedFigma, width, height);

    // 6. Upload images to Supabase Storage
    console.log('Uploading images to storage...');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const timestamp = Date.now();
    const bucketName = 'make-70da446d-ui-compare';

    // Create bucket if it doesn't exist
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === bucketName);
    if (!bucketExists) {
      console.log('Creating storage bucket...');
      await supabase.storage.createBucket(bucketName, { public: true });
    }

    // Upload Figma image
    const figmaPath = `${fileKey}/${nodeId}/figma-${timestamp}.png`;
    await supabase.storage
      .from(bucketName)
      .upload(figmaPath, figmaBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    // Upload screenshot
    const screenshotPath = `${fileKey}/${nodeId}/screenshot-${timestamp}.png`;
    await supabase.storage
      .from(bucketName)
      .upload(screenshotPath, screenshotBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    // Upload diff image
    const diffBuffer = PNG.sync.write(diffPng);
    const diffPath = `${fileKey}/${nodeId}/diff-${timestamp}.png`;
    await supabase.storage
      .from(bucketName)
      .upload(diffPath, diffBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    // Get public URLs
    const { data: figmaUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(figmaPath);

    const { data: screenshotUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(screenshotPath);

    const { data: diffUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(diffPath);

    return {
      figmaImageUrl: figmaUrlData.publicUrl,
      screenshotUrl: screenshotUrlData.publicUrl,
      diffImageUrl: diffUrlData.publicUrl,
      diffScore,
      resolution: { width, height },
      issues,
    };

  } catch (error) {
    console.error('Comparison error:', error);
    throw error;
  }
}

async function captureScreenshot(
  url: string,
  dimensions: { width: number; height: number }
): Promise<Uint8Array> {
  // Using ScreenshotOne API (free tier available)
  // Alternative: you can use any screenshot API service
  const apiKey = Deno.env.get('SCREENSHOT_API_KEY');

  if (!apiKey) {
    const errorMsg = 'SCREENSHOT_API_KEY not configured - cannot capture live website screenshots. Please add your Screenshot API key.';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  try {
    const screenshotUrl = `https://api.screenshotone.com/take?access_key=${apiKey}&url=${encodeURIComponent(url)}&viewport_width=${dimensions.width}&viewport_height=${dimensions.height}&device_scale_factor=1&format=png&full_page=false`;

    console.log(`Calling screenshot API for ${url} at ${dimensions.width}x${dimensions.height}...`);
    const response = await fetch(screenshotUrl);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Screenshot API error ${response.status}: ${errorText}`);
    }

    console.log('Screenshot captured successfully');
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.error('Screenshot capture failed:', error);
    throw new Error(`Failed to capture screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function resizeImage(png: PNG, targetWidth: number, targetHeight: number): PNG {
  if (png.width === targetWidth && png.height === targetHeight) {
    return png;
  }

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

function analyzeImageDifferences(
  screenshot: PNG,
  figma: PNG,
  width: number,
  height: number
): Array<{
  id: string;
  type: string;
  message: string;
  severity: string;
  region: { x: number; y: number; width: number; height: number };
}> {
  const issues: Array<{
    id: string;
    type: string;
    message: string;
    severity: string;
    region: { x: number; y: number; width: number; height: number };
  }> = [];

  // Divide image into regions for analysis
  const regionSize = 100; // 100x100 pixel regions
  const regionsX = Math.ceil(width / regionSize);
  const regionsY = Math.ceil(height / regionSize);

  for (let ry = 0; ry < regionsY; ry++) {
    for (let rx = 0; rx < regionsX; rx++) {
      const x = rx * regionSize;
      const y = ry * regionSize;
      const w = Math.min(regionSize, width - x);
      const h = Math.min(regionSize, height - y);

      // Calculate difference in this region
      let diffPixels = 0;
      let totalPixels = 0;
      let avgColorDiff = 0;

      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
          const idx = (py * width + px) * 4;

          const rDiff = Math.abs(screenshot.data[idx] - figma.data[idx]);
          const gDiff = Math.abs(screenshot.data[idx + 1] - figma.data[idx + 1]);
          const bDiff = Math.abs(screenshot.data[idx + 2] - figma.data[idx + 2]);

          const pixelDiff = (rDiff + gDiff + bDiff) / 3;
          avgColorDiff += pixelDiff;

          if (pixelDiff > 25) {
            diffPixels++;
          }
          totalPixels++;
        }
      }

      avgColorDiff = avgColorDiff / totalPixels;
      const diffPercentage = diffPixels / totalPixels;

      // Create issue if significant difference
      if (diffPercentage > 0.1) { // More than 10% pixels different
        let type = 'Layout';
        let message = `Region has ${(diffPercentage * 100).toFixed(0)}% pixel differences`;
        let severity = 'Low';

        if (avgColorDiff > 100) {
          type = 'Color';
          message = `Significant color mismatch detected (avg diff: ${avgColorDiff.toFixed(0)})`;
          severity = 'High';
        } else if (diffPercentage > 0.5) {
          type = 'Layout';
          message = `Major layout differences detected (${(diffPercentage * 100).toFixed(0)}% different)`;
          severity = 'High';
        } else if (avgColorDiff > 50) {
          type = 'Color';
          message = `Moderate color differences (avg diff: ${avgColorDiff.toFixed(0)})`;
          severity = 'Medium';
        } else if (diffPercentage > 0.25) {
          severity = 'Medium';
        }

        issues.push({
          id: `region-${rx}-${ry}`,
          type,
          message,
          severity,
          region: { x, y, width: w, height: h },
        });
      }
    }
  }

  // Limit to top 10 most significant issues
  return issues
    .sort((a, b) => {
      const severityOrder = { High: 3, Medium: 2, Low: 1 };
      return severityOrder[b.severity as keyof typeof severityOrder] -
        severityOrder[a.severity as keyof typeof severityOrder];
    })
    .slice(0, 10);
}