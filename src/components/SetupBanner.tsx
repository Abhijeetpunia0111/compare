import { AlertCircle, ExternalLink } from 'lucide-react';

export function SetupBanner() {
  return (
    <div className="border-b border-zinc-800 bg-gradient-to-r from-blue-950/20 to-purple-950/20 px-6 py-3">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 flex-shrink-0 text-blue-400" />
        <div className="flex-1">
          <p className="font-mono text-zinc-300">
            <span className="text-blue-400">Setup Required:</span> Configure API Keys
          </p>
          <div className="mt-2 space-y-1 font-mono text-zinc-500">
            <p>
              1. Generate a <strong className="text-zinc-400">Figma Personal Access Token</strong> (required)
            </p>
            <p className="pl-4 text-zinc-600">
              → Go to Figma Settings → Personal access tokens → Generate new token
            </p>
            <p className="pl-4 text-zinc-600">
              → Required scopes: <span className="text-amber-500">File content (read)</span> + <span className="text-amber-500">File export (read)</span>
            </p>
            <p className="mt-1">
              2. Get <strong className="text-zinc-400">ScreenshotOne API Key</strong> (optional - free tier available)
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href="https://www.figma.com/developers/api#access-tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded bg-blue-950/30 px-3 py-1.5 font-mono text-blue-400 hover:bg-blue-950/50"
          >
            <span>Figma Token</span>
            <ExternalLink className="size-3.5" />
          </a>
          <a
            href="https://screenshotone.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded bg-purple-950/30 px-3 py-1.5 font-mono text-purple-400 hover:bg-purple-950/50"
          >
            <span>Screenshot API</span>
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}