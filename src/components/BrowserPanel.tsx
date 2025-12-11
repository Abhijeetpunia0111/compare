import React, { useState, useEffect, useRef, useImperativeHandle, useCallback } from 'react';
import { Globe, RotateCw, ZoomIn, ZoomOut, Grid3x3, X, Loader2 } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface BrowserPanelProps {
  websiteUrl: string;
  onUrlChange: (url: string) => void;
  dimensions?: { width: number; height: number };
  onDimensionsReset?: () => void;
}

export interface BrowserPanelHandle {
  getScreenshot: () => string | null;
}

export const BrowserPanel = React.forwardRef<BrowserPanelHandle, BrowserPanelProps>(({ websiteUrl, onUrlChange, dimensions, onDimensionsReset }, ref) => {
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [isConnected, setIsConnected] = useState(false);
  const [imageSrc, setImageSrc] = useState<string>('');
  const [sessionActive, setSessionActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const isInitializingRef = useRef(false);

  useImperativeHandle(ref, () => ({
    getScreenshot: () => {
      return imageSrc;
    }
  }));

  // Update dimensions when prop changes
  useEffect(() => {
    if (sessionActive && socketRef.current && dimensions) {
      socketRef.current.emit('resize', dimensions);
    }
  }, [dimensions, sessionActive]);

  // Initialize socket connection
  useEffect(() => {
    const socket = io('http://localhost:3000');
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to simulation server');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from simulation server');
      setIsConnected(false);
      setSessionActive(false);
    });

    socket.on('frame', (base64: string) => {
      setImageSrc(`data:image/jpeg;base64,${base64}`);
      setIsLoading(false);
      isInitializingRef.current = false;
    });

    socket.on('session-started', () => {
      setSessionActive(true);
      // Loading remains true until first frame

      // If we have initial dimensions, send them now
      if (dimensions) {
        socket.emit('resize', dimensions);
      }
    });

    socket.on('loading-start', () => {
      setIsLoading(true);
    });

    socket.on('loading-end', () => {
      // Ignore loading-end if we are still in the initialization phase (waiting for first frame)
      if (isInitializingRef.current) return;

      // Small delay to ensure frame updates have caught up
      setTimeout(() => setIsLoading(false), 200);
    });

    socket.on('error', (err: string) => {
      console.error('Socket error:', err);
    });

    return () => {
      socket.disconnect();
    };
  }, []); // Remove dimensions from dependency to avoid reconnect loops

  const startSession = useCallback(() => {
    if (!socketRef.current || !websiteUrl) return;

    setIsLoading(true);
    setImageSrc(''); // Clear previous image
    isInitializingRef.current = true;

    socketRef.current.emit('start-session', {
      url: websiteUrl,
      width: dimensions?.width || 1280,
      height: dimensions?.height || 720
    });
  }, [websiteUrl, dimensions]);

  // Auto-load URL with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (websiteUrl && isValidUrl(websiteUrl)) {
        startSession();
      }
    }, 1500); // 1.5s debounce

    return () => clearTimeout(timer);
  }, [websiteUrl, startSession]);

  // Handle URL changes or "Reload"
  const handleReload = () => {
    startSession();
  };

  // Input handling
  const getCoords = (e: React.MouseEvent) => {
    if (!imgRef.current) return { x: 0, y: 0 };
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = (dimensions?.width || 1280) / rect.width;
    const scaleY = (dimensions?.height || 720) / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!sessionActive || !socketRef.current) return;
    const { x, y } = getCoords(e);
    socketRef.current.emit('input-event', { type: 'click', x, y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!sessionActive || !socketRef.current) return;
    const { x, y } = getCoords(e);
    socketRef.current.emit('input-event', { type: 'mousemove', x, y });
  };

  const containerRef = useRef<HTMLDivElement>(null);

  // Wheel handling with non-passive listener to prevent default scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault(); // Stop main page scroll

      // Only scroll remote if NOT synced (dimensions undefined)
      // or if user holds Shift (optional feature for forced scroll, but let's stick to strict requirement first)
      if (!sessionActive || !socketRef.current) return;

      if (dimensions) {
        // Dimensions are synced -> Lock scroll to prevent drift
        return;
      }

      socketRef.current.emit('input-event', { type: 'scroll', deltaX: e.deltaX, deltaY: e.deltaY });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [sessionActive, dimensions]); // Re-bind when dimensions change

  // Keyboard handling - basic implementation attached to window or specific focus area
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (sessionActive && socketRef.current) {
        socketRef.current.emit('input-event', { type: 'keydown', key: e.key });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessionActive]);

  const handleZoomIn = () => {
    const newZoom = Math.min(zoom + 10, 200);
    setZoom(newZoom);
    if (sessionActive && socketRef.current) {
      socketRef.current.emit('input-event', { type: 'zoom', scale: newZoom / 100 });
    }
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom - 10, 50);
    setZoom(newZoom);
    if (sessionActive && socketRef.current) {
      socketRef.current.emit('input-event', { type: 'zoom', scale: newZoom / 100 });
    }
  };

  // Validate URL
  const isValidUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const validUrl = websiteUrl && isValidUrl(websiteUrl);

  return (
    <div className="min-h-[600px] bg-zinc-900 p-6">
      <div className="mb-6 flex items-center justify-between border-b border-zinc-800 pb-4">
        <h2 className="font-mono text-zinc-400">Live Website</h2>
        <div className="flex items-center gap-2">
          {dimensions && (
            <div className="flex items-center gap-2 rounded bg-zinc-800 px-2 py-1">
              <span className="font-mono text-xs text-zinc-500">
                Fixed: {dimensions.width}x{dimensions.height}
              </span>
              {onDimensionsReset && (
                <button
                  onClick={onDimensionsReset}
                  className="rounded-full bg-zinc-700 p-0.5 text-zinc-400 hover:bg-zinc-600 hover:text-zinc-200"
                  title="Reset dimensions"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          )}
          <div className={`flex items-center gap-2 rounded px-2 py-1 bg-green-950/30`}>
            <div className={`size-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className={`font-mono ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
              {isConnected ? 'Sim Connected' : 'Sim Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* URL Input */}
      <div className="mb-4">
        <label className="mb-2 block font-mono text-zinc-400">Website URL</label>
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={websiteUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') startSession();
            }}
            placeholder="https://example.com"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-10 pr-4 font-mono text-zinc-100 placeholder:text-zinc-600 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
      </div>

      {/* Browser Controls */}
      <div className="mb-4 flex items-center gap-2">
        <button
          className="flex items-center gap-2 rounded bg-zinc-800 px-3 py-1.5 font-mono text-zinc-400 hover:bg-zinc-700"
          onClick={handleReload}
          title="Start Session / Reload"
        >
          <RotateCw className="size-3.5" />
          <span>Go</span>
        </button>
        <button
          className="flex items-center gap-2 rounded bg-zinc-800 px-3 py-1.5 font-mono text-zinc-400 hover:bg-zinc-700"
          onClick={handleZoomOut}
          title="Zoom out"
        >
          <ZoomOut className="size-3.5" />
        </button>
        <span className="rounded bg-zinc-950 px-3 py-1.5 font-mono text-zinc-300">
          {zoom}%
        </span>
        <button
          className="flex items-center gap-2 rounded bg-zinc-800 px-3 py-1.5 font-mono text-zinc-400 hover:bg-zinc-700"
          onClick={handleZoomIn}
          title="Zoom in"
        >
          <ZoomIn className="size-3.5" />
        </button>

        {dimensions && onDimensionsReset && (
          <button
            className="flex items-center gap-2 rounded bg-zinc-800 px-3 py-1.5 font-mono text-zinc-400 hover:bg-zinc-700 hover:text-red-400"
            onClick={onDimensionsReset}
            title="Reset to original dimensions"
          >
            <X className="size-3.5" />
            <span>Reset Size</span>
          </button>
        )}

        <button
          className={`ml-auto flex items-center gap-2 rounded px-3 py-1.5 font-mono ${showGrid
            ? 'bg-blue-950/30 text-blue-400'
            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          onClick={() => setShowGrid(!showGrid)}
          title="Toggle grid"
        >
          <Grid3x3 className="size-3.5" />
          <span>Grid</span>
        </button>
      </div>

      {/* Browser Preview */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="size-3 rounded-full bg-red-500/50" />
            <div className="size-3 rounded-full bg-yellow-500/50" />
            <div className="size-3 rounded-full bg-green-500/50" />
          </div>
          <div className="flex-1 rounded bg-zinc-900 px-3 py-1 font-mono text-zinc-500 flex justify-between items-center">
            <span className="truncate">{websiteUrl || 'No URL'}</span>
            {!isConnected && (
              <span className="ml-2 text-xs text-red-400 bg-red-950/30 px-2 py-0.5 rounded">
                SERVER OFFLINE
              </span>
            )}
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded border border-zinc-700 bg-zinc-900/50"
          style={{ height: '500px' }}
        >
          {showGrid && (
            <div
              className="pointer-events-none absolute inset-0 z-10 opacity-20"
              style={{
                backgroundImage:
                  'linear-gradient(to right, #3b82f6 1px, transparent 1px), linear-gradient(to bottom, #3b82f6 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            />
          )}

          <div
            ref={containerRef}
            className="h-full w-full overflow-hidden bg-white flex items-center justify-center relative select-none"
          // onWheel removed, handled by useEffect for consistency
          >
            {imageSrc ? (
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Stream"
                className="max-w-none origin-top-left"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                draggable={false}
              />
            ) : (
              <div className="text-center p-6">
                {isLoading ? (
                  <>
                    <Loader2 className="mx-auto size-12 animate-spin text-blue-500" />
                    <p className="mt-4 font-mono text-blue-400">Loading website...</p>
                    <p className="mt-2 text-xs font-mono text-zinc-500">Connecting to remote browser</p>
                  </>
                ) : !isConnected ? (
                  <>
                    <Globe className="mx-auto size-12 text-red-500" />
                    <p className="mt-4 font-mono text-red-400">Server Disconnected</p>
                    <p className="mt-2 font-mono text-zinc-500">
                      Please ensure the website-simulator server is running on port 3000
                    </p>
                  </>
                ) : (
                  <>
                    <Globe className="mx-auto size-12 text-zinc-700" />
                    <p className="mt-4 font-mono text-zinc-500">
                      {validUrl ? 'Ready to connect' : 'Enter a valid URL'}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className={`mt-4 rounded-lg border px-4 py-3 border-blue-900/50 bg-blue-950/20`}>
        <p className={`font-mono text-blue-400`}>
          Note: This is a live stream from a remote browser instance. Interactions are forwarded to the server.
        </p>
      </div>
    </div>
  );
});