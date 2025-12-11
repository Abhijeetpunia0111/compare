# UI Compare Lab

A visual testing tool that compares Figma designs with live websites and highlights pixel-level differences.

## 🎯 Features

### ✅ Fully Implemented
- **Figma API Integration** - Extract frames directly from Figma URLs
- **Split-Panel Interface** - Compare designs side-by-side
- **Auto Frame Detection** - Parse fileKey and nodeId from Figma URLs
- **Results Visualization** - View Design, Live, and Diff tabs
- **Issue Detection** - Categorize differences by type (Font, Color, Layout, Padding, Spacing)
- **Severity Levels** - High, Medium, Low issue classification
- **Interactive Highlighting** - Click issues to highlight regions in diff image
- **Zoom Controls** - 25% to 400% zoom on comparison images
- **Dark Mode UI** - Developer-focused aesthetic
- **Quick Start Guide** - Interactive onboarding for new users

### ⚠️ Currently Mocked (See Production Setup)
- Screenshot capture (requires Puppeteer or screenshot API)
- Pixel-level diff processing (requires pixelmatch library)
- Semantic CSS analysis (requires DOM inspection)

## 🚀 Quick Start

### 1. Get Your Figma Personal Access Token
1. Visit [Figma Settings](https://www.figma.com/developers/api#access-tokens)
2. Go to Account → Personal Access Tokens
3. Generate a new token
4. You'll be prompted to enter it when running your first comparison

### 2. Use the App
1. **Enter Figma URL** - Paste a Figma frame URL with node-id
   ```
   https://www.figma.com/design/{fileKey}/...?node-id={nodeId}
   ```
2. **Enter Website URL** - Paste the live website URL to compare
   ```
   https://yourwebsite.com
   ```
3. **Click "Compare UI"** - The tool will:
   - Export your Figma frame as PNG
   - Detect frame dimensions (width × height)
   - Generate comparison results (currently mocked for screenshots)

## 📁 Project Structure

```
/App.tsx                           # Main application
/components/
  ├── ActionBar.tsx                # Compare UI button and filters
  ├── FigmaPanel.tsx              # Left panel - Figma input
  ├── BrowserPanel.tsx            # Right panel - Website input
  ├── ResultsView.tsx             # Results container with tabs
  ├── ImageCompare.tsx            # Image viewer with zoom
  ├── IssuesSidebar.tsx           # Issues list with filtering
  ├── SetupBanner.tsx             # Setup instructions banner
  └── QuickStartGuide.tsx         # Interactive guide modal
/supabase/functions/server/
  └── index.tsx                   # Backend API (Figma integration)
```

## 🔧 Backend API

### Endpoint: POST /compare-ui

**Request:**
```json
{
  "figmaUrl": "https://www.figma.com/design/...",
  "websiteUrl": "https://example.com"
}
```

**Response:**
```json
{
  "figmaImageUrl": "https://...",
  "screenshotUrl": "https://...",
  "diffImageUrl": "https://...",
  "diffScore": 0.08,
  "resolution": {
    "width": 1440,
    "height": 900
  },
  "issues": [
    {
      "id": "1",
      "type": "Font|Color|Layout|Padding|Spacing",
      "message": "Font size mismatch: design 18px, live 16px",
      "severity": "Low|Medium|High",
      "region": { "x": 50, "y": 100, "width": 200, "height": 40 }
    }
  ]
}
```

## 🎨 UI Components

### FigmaPanel
- Figma URL input
- Auto-parses fileKey and nodeId
- Shows frame preview placeholder
- Metadata display (resolution, device type)

### BrowserPanel
- Website URL input
- Browser controls (zoom, grid, reload)
- Device presets (Mobile, Tablet, Web, TV)
- Screenshot preview placeholder

### ResultsView
- Tabbed interface (Design, Live, Diff)
- Resolution and diff score display
- Back button to return to input
- Integrated image viewer and issues sidebar

### IssuesSidebar
- Grouped by issue type
- Severity summary (High, Medium, Low counts)
- Click to highlight regions
- Shows coordinates and dimensions

## 🔨 Production Setup

For a production implementation, you need to add:

### 1. Screenshot Service
**Option A:** Use a screenshot API (recommended)
- [ScreenshotAPI.net](https://screenshotapi.net)
- [Urlbox.io](https://urlbox.io)
- [Browserless.io](https://browserless.io)

**Option B:** Deploy with Puppeteer support
- Render, Railway, or Fly.io
- AWS Lambda with Chrome Layer

### 2. Image Diff Processing
Install `pixelmatch` and `pngjs` to generate diff images:

```typescript
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

// Compare two PNG buffers
const mismatchedPixels = pixelmatch(
  img1.data,
  img2.data,
  diff.data,
  width,
  height,
  { threshold: 0.1 }
);
```

### 3. Storage
Use Supabase Storage for images:
- Create bucket: `make-70da446d-screenshots`
- Store: figma.png, screenshot.png, diff.png
- Return signed URLs (1 hour expiry)

### 4. Semantic Analysis (Optional)
Use Playwright to inspect DOM and detect:
- Font size differences
- Color mismatches
- Padding/margin differences
- Layout shifts

See `IMPLEMENTATION_NOTES.md` for detailed code examples.

## 🔑 Environment Variables

- `FIGMA_ACCESS_TOKEN` - Your Figma personal access token
- `SUPABASE_URL` - Auto-provided by Figma Make
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-provided by Figma Make

## 💡 Tips

1. **Start with simple frames** - Single components work best for testing
2. **Use publicly accessible websites** - Screenshot services need to reach the URL
3. **Check Figma frame bounds** - Ensure frames have clear bounding boxes
4. **Test incrementally** - Start with one comparison before batching

## 📖 How It Works

1. **Parse Figma URL** → Extract fileKey and nodeId
2. **Fetch Frame Metadata** → Get width, height from Figma API
3. **Export Frame Image** → Download PNG from Figma
4. **Capture Screenshot** → (Mocked) Use Puppeteer at same resolution
5. **Run Pixel Diff** → (Mocked) Compare images with pixelmatch
6. **Analyze Issues** → (Mocked) Inspect DOM for semantic differences
7. **Display Results** → Show diff image with highlighted issues

## 🐛 Current Limitations

- **Screenshots are mocked** - Returns Figma image as placeholder
- **Diffs are mocked** - Shows sample issues for demo purposes
- **No real browser automation** - Puppeteer/Playwright not available in Deno Deploy

## 🚦 Next Steps

1. ✅ Test with real Figma URLs
2. 📸 Integrate screenshot API service
3. 🎨 Add real pixel diff processing
4. 🔍 Implement DOM inspection for semantic analysis
5. 💾 Add Supabase Storage for image persistence
6. 📊 Add comparison history
7. 🔗 Add shareable comparison links

## 📚 Documentation

- `README.md` - This file (overview and quick start)
- `IMPLEMENTATION_NOTES.md` - Detailed technical implementation guide
- Backend code is fully commented

---

Built with **Figma Make** 🎨  
Powered by **Figma API** + **Supabase** + **React**
