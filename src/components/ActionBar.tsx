import { GitCompare, Loader2, LayoutGrid, Palette, Type } from 'lucide-react';

interface ActionBarProps {
  onCompare: () => void;
  isComparing: boolean;
  disabled: boolean;
  sensitivity: number;
  onSensitivityChange: (level: number) => void;
  hasResult: boolean;
}

export function ActionBar({
  onCompare,
  isComparing,
  disabled,
  sensitivity,
  onSensitivityChange,
  hasResult
}: ActionBarProps) {
  return (
    <div className="border-b border-zinc-800 bg-zinc-900 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onCompare}
            disabled={disabled || isComparing}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-2.5 font-mono transition-all hover:from-blue-500 hover:to-purple-500 disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed"
          >
            {isComparing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Comparing...</span>
              </>
            ) : (
              <>
                <GitCompare className="size-4" />
                <span>Compare UI</span>
              </>
            )}
          </button>

          <div className="h-8 w-px bg-zinc-800" />

          <div className="flex items-center gap-2">
            <p className="font-mono text-zinc-500">Filter:</p>
            <button className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 font-mono text-zinc-400 hover:border-blue-500 hover:text-blue-400">
              <LayoutGrid className="size-3.5" />
              <span>Layout</span>
            </button>
            <button className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 font-mono text-zinc-400 hover:border-purple-500 hover:text-purple-400">
              <Palette className="size-3.5" />
              <span>Color</span>
            </button>
            <button className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 font-mono text-zinc-400 hover:border-green-500 hover:text-green-400">
              <Type className="size-3.5" />
              <span>Text</span>
            </button>
          </div>

          {/* Sensitivity Controls */}
          <div className="flex items-center gap-2 ml-4">
            <span className="font-mono text-zinc-500">Threshold:</span>
            {hasResult ? (
              <div className="flex items-center gap-1.5 rounded border border-blue-900/50 bg-blue-950/20 px-3 py-1.5 font-mono text-blue-400">
                <span>{sensitivity}x Applied</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    onClick={() => onSensitivityChange(level)}
                    className={`flex items-center justify-center rounded border px-3 py-1.5 font-mono text-sm transition-all ${sensitivity === level
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                      }`}
                    title={`${level}x Sensitivity`}
                    disabled={isComparing}
                  >
                    {level}x
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded bg-zinc-800/50 px-3 py-1.5">
            <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-zinc-400">Ready</span>
          </div>
        </div>
      </div>
    </div>
  );
}