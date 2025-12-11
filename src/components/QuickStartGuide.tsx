import { X, Link2, Globe, GitCompare, Eye } from 'lucide-react';

interface QuickStartGuideProps {
  onClose: () => void;
}

export function QuickStartGuide({ onClose }: QuickStartGuideProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X className="size-5" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="mb-2 font-mono">Quick Start Guide</h2>
          <p className="text-zinc-400">Get started with UI Compare Lab in 3 simple steps</p>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {/* Step 1 */}
          <div className="flex gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-950/30 font-mono text-blue-400">
              1
            </div>
            <div className="flex-1">
              <div className="mb-2 flex items-center gap-2">
                <Link2 className="size-5 text-blue-400" />
                <h3 className="font-mono text-zinc-300">Enter Figma URL</h3>
              </div>
              <p className="mb-2 text-zinc-500">
                Paste a Figma frame URL with node-id parameter
              </p>
              <code className="rounded bg-zinc-900 px-2 py-1 font-mono text-zinc-400">
                figma.com/design/FILE_KEY?node-id=X-Y
              </code>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-green-950/30 font-mono text-green-400">
              2
            </div>
            <div className="flex-1">
              <div className="mb-2 flex items-center gap-2">
                <Globe className="size-5 text-green-400" />
                <h3 className="font-mono text-zinc-300">Enter Website URL</h3>
              </div>
              <p className="mb-2 text-zinc-500">
                Provide the live website URL to compare against
              </p>
              <code className="rounded bg-zinc-900 px-2 py-1 font-mono text-zinc-400">
                https://example.com/page
              </code>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-purple-950/30 font-mono text-purple-400">
              3
            </div>
            <div className="flex-1">
              <div className="mb-2 flex items-center gap-2">
                <GitCompare className="size-5 text-purple-400" />
                <h3 className="font-mono text-zinc-300">Compare UI</h3>
              </div>
              <p className="text-zinc-500">
                Click &quot;Compare UI&quot; to analyze differences and view detailed reports
              </p>
            </div>
          </div>
        </div>

        

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-2.5 font-mono transition-all hover:from-blue-500 hover:to-purple-500"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}