import { useState, useEffect } from 'react';
import { Link2, ExternalLink, RefreshCw } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface FigmaPanelProps {
  figmaUrl: string;
  onUrlChange: (url: string) => void;
  onDimensionsChange?: (dimensions: { width: number; height: number }) => void;
  onFrameSelect?: (nodeId: string, dimensions: { width: number; height: number }) => void;
}

export function FigmaPanel({ figmaUrl, onUrlChange, onDimensionsChange }: FigmaPanelProps) {
  const [parsedData, setParsedData] = useState<{
    fileKey: string | null;
    nodeId: string | null;
  }>({ fileKey: null, nodeId: null });
  const [manualNodeId, setManualNodeId] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (figmaUrl) {
      try {
        const url = new URL(figmaUrl);
        const pathParts = url.pathname.split('/');
        const fileKey = pathParts[2] || null;
        const nodeId = url.searchParams.get('node-id');
        setParsedData({ fileKey, nodeId });
        if (nodeId) {
          setManualNodeId(nodeId);
        }
      } catch {
        setParsedData({ fileKey: null, nodeId: null });
      }
    } else {
      setParsedData({ fileKey: null, nodeId: null });
      setManualNodeId('');
    }
  }, [figmaUrl]);

  const handleNodeIdChange = (value: string) => {
    setManualNodeId(value);
    if (parsedData.fileKey && value) {
      const newUrl = `https://www.figma.com/design/${parsedData.fileKey}/?node-id=${value}`;
      onUrlChange(newUrl);
    }
  };

  const openInFigma = () => {
    if (figmaUrl) {
      window.open(figmaUrl, '_blank');
    }
  };

  const handleSyncDimensions = async () => {
    if (!figmaUrl || !onDimensionsChange) return;

    setIsSyncing(true);
    try {
      const response = await fetch('http://localhost:3001/figma-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ figmaUrl: figmaUrl }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch dimensions');
      }

      const data = await response.json();
      if (data.dimensions) {
        onDimensionsChange(data.dimensions);
      }
    } catch (error) {
      console.error('Error syncing dimensions:', error);
      // You might want to show a toast error here
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-[600px] bg-zinc-900 p-6">
      <div className="mb-6 flex items-center justify-between border-b border-zinc-800 pb-4">
        <h2 className="font-mono text-zinc-400">Design Source</h2>
        <div className="flex items-center gap-2 rounded bg-blue-950/30 px-2 py-1">
          <div className="size-2 rounded-full bg-blue-500" />
          <span className="font-mono text-blue-400">Figma</span>
        </div>
      </div>

      {/* URL Input */}
      <div className="mb-6">
        <label className="mb-2 block font-mono text-zinc-400">Figma File URL</label>
        <div className="relative">
          <Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={figmaUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://www.figma.com/design/..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-10 pr-4 font-mono text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Node ID Input */}
      {parsedData.fileKey && (
        <div className="mb-6">
          <label className="mb-2 block font-mono text-zinc-400">Frame Node ID (optional)</label>
          <input
            type="text"
            value={manualNodeId}
            onChange={(e) => handleNodeIdChange(e.target.value)}
            placeholder="e.g., 123-456 or 123:456"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 px-4 font-mono text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1.5 font-mono text-zinc-600">
            Leave empty to capture the entire page, or specify a frame node-id
          </p>
        </div>
      )}

      {/* Canvas Preview */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-mono text-zinc-400">Canvas Preview</p>
            <p className="mt-1 font-mono text-zinc-600">
              Read-only preview - open in Figma to interact
            </p>
          </div>
          <div className="flex items-center gap-2">
            {parsedData.fileKey && onDimensionsChange && (
              <button
                onClick={handleSyncDimensions}
                disabled={isSyncing}
                className="flex items-center gap-2 rounded bg-zinc-800 px-3 py-1.5 font-mono text-zinc-400 hover:bg-zinc-700 disabled:opacity-50"
                title="Get dimensions from Figma frame"
              >
                <RefreshCw className={`size-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Sync Dims</span>
              </button>
            )}
            {parsedData.fileKey && (
              <button
                onClick={openInFigma}
                className="flex items-center gap-2 rounded bg-blue-950/30 px-3 py-1.5 font-mono text-blue-400 hover:bg-blue-950/50"
              >
                <ExternalLink className="size-3.5" />
                <span>Open in Figma</span>
              </button>
            )}
          </div>
        </div>

        {parsedData.fileKey ? (
          <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900">
            <iframe
              src={`https://www.figma.com/embed?embed_host=ui-compare&url=${encodeURIComponent(figmaUrl)}`}
              className="h-[500px] w-full"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded border border-dashed border-zinc-700 bg-zinc-900/50">
            <div className="text-center">
              <p className="font-mono text-zinc-600">Enter Figma URL to preview canvas</p>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      {/* <div className="mt-4 rounded-lg border border-blue-900/50 bg-blue-950/20 p-4">
        <p className="mb-2 font-mono text-blue-400">How to select a specific frame:</p>
        <ol className="list-decimal space-y-1 pl-5 font-mono text-zinc-400">
          <li>Click &quot;Open in Figma&quot; to open the file in a new tab</li>
          <li>Select your target frame in Figma</li>
          <li>Look at the URL - it will contain <span className="text-zinc-300">?node-id=123-456</span></li>
          <li>Copy just the node-id value (e.g., <span className="text-zinc-300">123-456</span>)</li>
          <li>Paste it in the &quot;Frame Node ID&quot; field above</li>
        </ol>
        <p className="mt-3 font-mono text-zinc-500">
          💡 Tip: Click &quot;Sync Dims&quot; to apply Figma frame dimensions to the live website view.
        </p>
      </div> */}
    </div>
  );
}