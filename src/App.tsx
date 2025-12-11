import { useState, useRef } from 'react';
import { FigmaPanel } from './components/FigmaPanel';
import { BrowserPanel, BrowserPanelHandle } from './components/BrowserPanel';
import { ResultsView } from './components/ResultsView';
import { ActionBar } from './components/ActionBar';
import { SetupBanner } from './components/SetupBanner';
import { QuickStartGuide } from './components/QuickStartGuide';
import { Loader2 } from 'lucide-react';
import { projectId, publicAnonKey } from './utils/supabase/info';

export interface ComparisonResult {
  figmaImageUrl: string;
  screenshotUrl: string;
  diffImageUrl: string;
  diffScore: number;
  resolution: {
    width: number;
    height: number;
  };
  issues: Issue[];
}

export interface Issue {
  id: string;
  type: 'Font' | 'Color' | 'Layout' | 'Padding' | 'Spacing';
  message: string;
  severity: 'Low' | 'Medium' | 'High';
  region: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export default function App() {
  const [figmaUrl, setFigmaUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isComparing, setIsComparing] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [currentDimensions, setCurrentDimensions] = useState<{ width: number; height: number } | undefined>(undefined);
  const [sensitivity, setSensitivity] = useState(3);

  const browserPanelRef = useRef<BrowserPanelHandle>(null);

  const handleCompare = async (sensitivityOverride?: number) => {
    if (!figmaUrl || !websiteUrl) {
      setError('Please provide both Figma URL and Website URL');
      return;
    }

    const sens = sensitivityOverride ?? sensitivity;
    if (sensitivityOverride) setSensitivity(sens);

    setIsComparing(true);
    setError(null);
    setResult(null); // Clear previous results

    try {
      let dimensions = currentDimensions;

      // 1. If dimensions are not synced, fetch them first
      if (!dimensions) {
        console.log('Dimensions not set, fetching from Figma...');
        setError('Syncing dimensions from Figma...');


        const metadataResponse = await fetch(
          `http://localhost:3001/figma-metadata`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ figmaUrl }),
          }
        );

        if (!metadataResponse.ok) {
          throw new Error('Failed to fetch Figma dimensions. Please check the URL.');
        }

        const metadata = await metadataResponse.json();
        if (metadata.dimensions) {
          dimensions = metadata.dimensions;
          setCurrentDimensions(dimensions);
          // Small delay to allow state update and potential UI resize visibility
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setError(null); // Clear "Syncing..." message

      // Get current screenshot from BrowserPanel if available
      const screenshot = browserPanelRef.current?.getScreenshot();

      const response = await fetch(
        `http://localhost:3001/compare-ui`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            figmaUrl,
            websiteUrl,
            screenshot, // Pass client-side screenshot
            dimensions, // Pass confirmed dimensions
            sensitivity: sens, // Pass sensitivity
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Comparison failed');
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      console.error('Comparison error:', err);
      setError(err instanceof Error ? err.message : 'Failed to compare UI');
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Quick Start Guide */}
      {showGuide && <QuickStartGuide onClose={() => setShowGuide(false)} />}

      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="font-mono">UI Compare Lab</h1>
            <p className="text-zinc-400">Visual testing tool for Figma designs vs live websites</p>
          </div>
          <button
            onClick={() => setShowGuide(true)}
            className="rounded border border-zinc-700 bg-zinc-800/50 px-4 py-2 font-mono text-zinc-400 hover:border-blue-500 hover:bg-blue-950/20 hover:text-blue-400"
          >
            Quick Start Guide
          </button>
        </div>
      </header>

      {/* Setup Banner */}
      {/* <SetupBanner /> */}

      {/* Action Bar */}
      <ActionBar
        onCompare={() => handleCompare()}
        isComparing={isComparing}
        disabled={!figmaUrl || !websiteUrl}
        sensitivity={sensitivity}
        onSensitivityChange={setSensitivity}
        hasResult={!!result}
      />

      {/* Error Message */}
      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Main Content */}
      {isComparing ? (
        <div className="flex min-h-[600px] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-12 animate-spin text-blue-500" />
            <p className="mt-4 text-zinc-400">Comparing UI...</p>
            <p className="mt-2 font-mono text-zinc-500">
              Exporting Figma frame → Capturing screenshot → Running pixel diff
            </p>
          </div>
        </div>
      ) : result ? (
        <ResultsView
          result={result}
          onBack={() => setResult(null)}
          sensitivity={sensitivity}
          onSensitivityChange={handleCompare}
        />
      ) : (
        <div className="grid grid-cols-2 gap-px bg-zinc-800">
          <FigmaPanel
            figmaUrl={figmaUrl}
            onUrlChange={setFigmaUrl}
            onDimensionsChange={setCurrentDimensions}
          />
          <BrowserPanel
            ref={browserPanelRef}
            websiteUrl={websiteUrl}
            onUrlChange={setWebsiteUrl}
            dimensions={currentDimensions}
            onDimensionsReset={() => setCurrentDimensions(undefined)}
          />
        </div>
      )}
    </div>
  );
}