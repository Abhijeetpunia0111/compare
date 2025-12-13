// BrowserPanel.tsx
import React, {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  useCallback
} from "react";
import {
  Globe,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Grid3x3,
  X,
  Loader2
} from "lucide-react";
import { io, Socket } from "socket.io-client";

interface BrowserPanelProps {
  websiteUrl: string;
  onUrlChange: (url: string) => void;
  dimensions?: { width: number; height: number };
  onDimensionsReset?: () => void;
}

export interface BrowserPanelHandle {
  getScreenshot: () => string | null;
}

export const BrowserPanel = React.forwardRef<
  BrowserPanelHandle,
  BrowserPanelProps
>(({ websiteUrl, onUrlChange, dimensions, onDimensionsReset }, ref) => {
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [isConnected, setIsConnected] = useState(false);
  const [imageSrc, setImageSrc] = useState<string>("");
  const [sessionActive, setSessionActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // used to guard the initial wait-for-first-frame state
  const isInitializingRef = useRef(false);

  useImperativeHandle(ref, () => ({
    getScreenshot: () => imageSrc || null
  }));

  // Backend URL: check env var commonly used by CRA / Next / Vite
  const BACKEND = import.meta.env.VITE_BACKEND;

  // Initialize socket once
  useEffect(() => {
    // create socket but do not force reconnect loops by recreating in deps
    const socket = io(BACKEND, {
      transports: ["websocket"],
      secure: true,
      // helpful options for production behind proxies
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      path: "/socket.io"
    });

    socketRef.current = socket;

    const onConnect = () => {
      console.log("Socket connected:", socket.id);
      setIsConnected(true);

      // if we had started a session before reconnect, the server may need restart
      // emit resize if we already have dimensions (server might want them immediately)
      if (dimensions) {
        socket.emit("resize", dimensions);
      }
    };

    const onDisconnect = (reason?: string) => {
      console.log("Socket disconnected:", reason);
      setIsConnected(false);
      setSessionActive(false);
    };

    const onFrame = (base64: string) => {
      // set first frame & mark initialization done
      setImageSrc(`data:image/jpeg;base64,${base64}`);
      setIsLoading(false);
      isInitializingRef.current = false;
    };

    const onSessionStarted = () => {
      console.log("session-started received");
      setSessionActive(true);
      // Server will begin sending frames; keep loading until first frame arrives
      isInitializingRef.current = true;

      // If we already have known dimensions, send them
      if (dimensions) {
        socket.emit("resize", dimensions);
      }
    };

    const onLoadingStart = () => {
      setIsLoading(true);
    };

    const onLoadingEnd = () => {
      if (isInitializingRef.current) return;
      // small delay to ensure UI has updated to latest frame
      setTimeout(() => setIsLoading(false), 200);
    };

    const onError = (err: any) => {
      console.error("Socket error event:", err);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("frame", onFrame);
    socket.on("session-started", onSessionStarted);
    socket.on("loading-start", onLoadingStart);
    socket.on("loading-end", onLoadingEnd);
    socket.on("error", onError);

    // cleanup
    return () => {
      try {
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("frame", onFrame);
        socket.off("session-started", onSessionStarted);
        socket.off("loading-start", onLoadingStart);
        socket.off("loading-end", onLoadingEnd);
        socket.off("error", onError);
      } catch (e) {
        // no-op
      }
      socket.disconnect();
      socketRef.current = null;
    };
    // intentionally empty dependency array: connect once on mount
    // BACKEND is constant per deploy; if you change it dynamically, you can recreate the effect manually
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Send resize when dimensions prop changes and we have a connected socket & active session
  useEffect(() => {
    if (socketRef.current && sessionActive && dimensions) {
      socketRef.current.emit("resize", dimensions);
    }
  }, [dimensions, sessionActive]);

  // Start session function (useCallback to keep stable)
  const startSession = useCallback(() => {
    if (!socketRef.current || !websiteUrl) return;

    setIsLoading(true);
    setImageSrc("");
    isInitializingRef.current = true;

    socketRef.current.emit("start-session", {
      url: websiteUrl,
      width: dimensions?.width || 1280,
      height: dimensions?.height || 720
    });
  }, [websiteUrl, dimensions]);

  // Debounced auto-start when websiteUrl changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (websiteUrl) {
        // basic URL validation
        try {
          const parsed = new URL(websiteUrl);
          if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            startSession();
          }
        } catch {
          // invalid URL — ignore
        }
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [websiteUrl, startSession]);

  // Clean mouse coords relative to image and scale
  const getCoords = (e: React.MouseEvent) => {
    if (!imgRef.current) return { x: 0, y: 0 };
    const rect = imgRef.current.getBoundingClientRect();
    // Use natural dimensions if you want exact pixel mapping; we use provided `dimensions` prop
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
    socketRef.current.emit("input-event", { type: "click", x, y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!sessionActive || !socketRef.current) return;
    const { x, y } = getCoords(e);
    socketRef.current.emit("input-event", { type: "mousemove", x, y });
  };

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Wheel handling: use non-passive listener to prevent default scrolling when necessary
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // prevent the main document from scrolling while interacting the simulated browser
      e.preventDefault();

      if (!sessionActive || !socketRef.current) return;

      // If 'dimensions' is present we treat scroll as locked (remote is sized), so we skip sending scroll
      if (dimensions) return;

      socketRef.current.emit("input-event", {
        type: "scroll",
        deltaX: e.deltaX,
        deltaY: e.deltaY
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [sessionActive, dimensions]);

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;
      if (sessionActive && socketRef.current) {
        socketRef.current.emit("input-event", { type: "keydown", key: e.key });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sessionActive]);

  const handleZoomIn = () => {
    const newZoom = Math.min(zoom + 10, 200);
    setZoom(newZoom);
    if (sessionActive && socketRef.current) {
      socketRef.current.emit("input-event", { type: "zoom", scale: newZoom / 100 });
    }
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom - 10, 50);
    setZoom(newZoom);
    if (sessionActive && socketRef.current) {
      socketRef.current.emit("input-event", { type: "zoom", scale: newZoom / 100 });
    }
  };

  // small helper
  const isValidUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
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
            <div className={`size-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
            <span className={`font-mono ${isConnected ? "text-green-400" : "text-red-400"}`}>
              {isConnected ? "Sim Connected" : "Sim Disconnected"}
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
              if (e.key === "Enter") startSession();
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
          onClick={() => startSession()}
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
        <span className="rounded bg-zinc-950 px-3 py-1.5 font-mono text-zinc-300">{zoom}%</span>
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
          className={`ml-auto flex items-center gap-2 rounded px-3 py-1.5 font-mono ${showGrid ? "bg-blue-950/30 text-blue-400" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
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
            <span className="truncate">{websiteUrl || "No URL"}</span>
            {!isConnected && (
              <span className="ml-2 text-xs text-red-400 bg-red-950/30 px-2 py-0.5 rounded">SERVER OFFLINE</span>
            )}
          </div>
        </div>
        <div className="relative overflow-hidden rounded border border-zinc-700 bg-zinc-900/50" style={{ height: "500px" }}>
          {showGrid && (
            <div
              className="pointer-events-none absolute inset-0 z-10 opacity-20"
              style={{
                backgroundImage:
                  "linear-gradient(to right, #3b82f6 1px, transparent 1px), linear-gradient(to bottom, #3b82f6 1px, transparent 1px)",
                backgroundSize: "20px 20px"
              }}
            />
          )}

          <div ref={containerRef} className="h-full w-full overflow-hidden bg-white flex items-center justify-center relative select-none">
            {imageSrc ? (
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Stream"
                className="max-w-none origin-top-left"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: "top left"
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
                    <p className="mt-2 font-mono text-zinc-500">Please ensure the website-simulator server is running and reachable</p>
                  </>
                ) : (
                  <>
                    <Globe className="mx-auto size-12 text-zinc-700" />
                    <p className="mt-4 font-mono text-zinc-500">{validUrl ? "Ready to connect" : "Enter a valid URL"}</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className={`mt-4 rounded-lg border px-4 py-3 border-blue-900/50 bg-blue-950/20`}>
        <p className={`font-mono text-blue-400`}>Note: This is a live stream from a remote browser instance. Interactions are forwarded to the server.</p>
      </div>
    </div>
  );
});

export default BrowserPanel;
