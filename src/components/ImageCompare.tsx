import { useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Download } from 'lucide-react';
import { Issue } from '../App';

interface ImageCompareProps {
  imageUrl: string;
  selectedIssue: Issue | null;
  activeTab: 'design' | 'heatmap' | 'image_diff';
  issues?: Issue[];
  onSelectIssue?: (issue: Issue) => void;
}

export function ImageCompare({
  imageUrl,
  selectedIssue,
  activeTab,
  issues = [],
  onSelectIssue = () => { },
}: ImageCompareProps) {
  const [zoom, setZoom] = useState(100);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 400));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 25));
  const handleReset = () => setZoom(100);

  return (
    <div className="relative flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-6 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="rounded bg-zinc-800 p-2 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
            title="Zoom out"
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            onClick={handleReset}
            className="rounded bg-zinc-800 px-3 py-2 font-mono text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
            title="Reset zoom"
          >
            {zoom}%
          </button>
          <button
            onClick={handleZoomIn}
            className="rounded bg-zinc-800 p-2 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
            title="Zoom in"
          >
            <ZoomIn className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded bg-zinc-800 px-3 py-2 font-mono text-zinc-400 hover:bg-zinc-700">
            <Maximize2 className="size-4" />
            <span>Fullscreen</span>
          </button>
          <button className="flex items-center gap-2 rounded bg-zinc-800 px-3 py-2 font-mono text-zinc-400 hover:bg-zinc-700">
            <Download className="size-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Image Container */}
      <div className="flex-1 overflow-auto bg-zinc-950 p-8">
        <div className="flex min-h-full items-center justify-center">
          <div className="relative" style={{ transform: `scale(${zoom / 100})` }}>
            <img
              src={imageUrl}
              alt={activeTab === 'design' ? 'Figma design' : activeTab === 'heatmap' ? 'Heatmap Comparison' : 'Image Diff'}
              className="max-w-none rounded border border-zinc-700 shadow-2xl"
              style={{ imageRendering: zoom > 100 ? 'pixelated' : 'auto' }}
            />

            {/* Highlight all issues */}
            {activeTab === 'image_diff' &&
              issues.map((issue) => {
                const isSelected = selectedIssue?.id === issue.id;
                return (
                  <div
                    key={issue.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectIssue(issue);
                    }}
                    className={`absolute cursor-pointer transition-all duration-200 ${isSelected
                        ? 'border-2 border-red-500 bg-red-500/20 z-10 animate-pulse'
                        : 'border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/60'
                      }`}
                    style={{
                      left: `${issue.region.x}px`,
                      top: `${issue.region.y}px`,
                      width: `${issue.region.width}px`,
                      height: `${issue.region.height}px`,
                    }}
                  >
                    {isSelected && (
                      <div className="absolute -top-6 left-0 whitespace-nowrap rounded bg-red-500 px-2 py-1 font-mono text-xs text-white shadow-lg">
                        {issue.type} • {issue.severity}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Info Banner */}
      {(activeTab === 'heatmap' || activeTab === 'image_diff') && (
        <div className="border-t border-zinc-800 bg-zinc-900/80 px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            {activeTab === 'heatmap' ? (
              <p className="font-mono text-zinc-400">
                <span className="text-purple-400">Purple/Magenta highlights</span> indicate pixel
                differences
              </p>
            ) : (
              <p className="font-mono text-zinc-400">
                <span className="text-red-400">Red boxes</span> indicate detected issues
              </p>
            )}

            <p className="font-mono text-zinc-500">
              {activeTab === 'image_diff'
                ? 'Click boxes to highlight details'
                : 'Switch to Image Diff to see regions'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
