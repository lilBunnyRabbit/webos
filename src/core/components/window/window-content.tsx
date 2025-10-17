import { useVersion } from "@/core/contexts/version";
import { useWindowToolbar } from "@/core/contexts/window";
import { cn } from "@/core/lib/utils";
import { AlertTriangle, ChevronDown, ChevronUp, Code, Loader, Power, RotateCcw, WifiOff } from "lucide-react";
import React, { useState } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";

export function WindowContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const { zoom } = useWindowToolbar();

  return (
    <div className={cn("overflow-hidden bg-background rounded-t-sm", className)}>
      <div
        className="h-full w-full overflow-auto @container"
        style={{
          zoom,
        }}
      >
        <ErrorBoundary FallbackComponent={AppErrorFallback}>
          <React.Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <Loader className="w-8 h-8 animate-spin animation-duration-[2.5s] text-primary" />
              </div>
            }
          >
            {children}
          </React.Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

// TODO: vibed
interface ErrorDetails {
  isLazyLoadError: boolean;
  isNetworkError: boolean;
  isChunkLoadError: boolean;
  message: string;
  stack?: string;
}

function getErrorDetails(error: Error): ErrorDetails {
  const errorMessage = error.message.toLowerCase();
  const errorStack = error.stack?.toLowerCase() || "";

  // Check for lazy loading / dynamic import errors
  const isChunkLoadError =
    errorMessage.includes("failed to fetch dynamically imported module") ||
    errorMessage.includes("dynamically imported module") ||
    errorMessage.includes("chunk") ||
    errorStack.includes("chunk");

  const isNetworkError =
    errorMessage.includes("failed to fetch") ||
    errorMessage.includes("networkerror") ||
    errorMessage.includes("network error");

  const isLazyLoadError = isChunkLoadError || isNetworkError;

  return {
    isLazyLoadError,
    isNetworkError,
    isChunkLoadError,
    message: error.message,
    stack: error.stack,
  };
}

function AppErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { applyUpdate, isUpdating } = useVersion();

  const [showDetails, setShowDetails] = useState(false);
  const errorDetails = getErrorDetails(error);

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
      {/* Icon */}
      <div className="mb-4">
        {errorDetails.isLazyLoadError ? (
          <WifiOff className="w-12 h-12 text-accent" />
        ) : (
          <AlertTriangle className="w-12 h-12 text-accent" />
        )}
      </div>

      {/* Title */}
      <h2 className="mb-2 text-xl font-semibold text-foreground">
        {errorDetails.isLazyLoadError ? "Failed to Load App" : "App Crashed"}
      </h2>

      {/* Description */}
      <div className="mb-6 text-sm text-foreground/70 max-w-md">
        {errorDetails.isChunkLoadError && (
          <p>
            The app module could not be loaded. This usually happens when the app code was updated while you were using
            it.
          </p>
        )}
        {errorDetails.isNetworkError && !errorDetails.isChunkLoadError && (
          <p>A network error occurred while loading the app. Please check your internet connection.</p>
        )}
        {!errorDetails.isLazyLoadError && (
          <p>
            An unexpected error occurred while running this app. The app may have encountered a bug or an invalid state.
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-4">
        <button
          className="px-4 py-2 rounded bg-transparent text-accent font-medium hover:bg-accent hover:text-background transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => applyUpdate()}
          disabled={isUpdating}
        >
          <Power className={`w-4 h-4 ${isUpdating ? "animate-spin" : ""}`} />
          {isUpdating ? "Updating..." : "Update Client"}
        </button>

        <button
          className="px-4 py-2 rounded bg-primary text-background font-medium hover:bg-transparent hover:text-primary transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={resetErrorBoundary}
          disabled={isUpdating}
        >
          <RotateCcw className="w-4 h-4" />
          Retry
        </button>
      </div>

      {/* Error Details Toggle */}
      <button
        className="text-xs text-foreground/50 hover:text-foreground/80 transition flex items-center gap-1 mt-2"
        onClick={() => setShowDetails(!showDetails)}
      >
        <Code className="w-3 h-3" />
        {showDetails ? (
          <>
            Hide Details
            <ChevronUp className="w-3 h-3" />
          </>
        ) : (
          <>
            Show Details
            <ChevronDown className="w-3 h-3" />
          </>
        )}
      </button>

      {/* Error Details */}
      {showDetails && (
        <div className="mt-4 p-4 bg-muted/50 rounded-md text-left max-w-2xl w-full max-h-48">
          <div className="text-xs font-mono">
            <div className="mb-2">
              <span className="text-foreground/50">Error Type:</span>{" "}
              <span className="text-foreground">
                {errorDetails.isChunkLoadError
                  ? "Chunk Load Error"
                  : errorDetails.isNetworkError
                  ? "Network Error"
                  : "Runtime Error"}
              </span>
            </div>
            <div className="mb-2">
              <span className="text-foreground/50">Message:</span>{" "}
              <span className="text-red-400">{errorDetails.message}</span>
            </div>
            {errorDetails.stack && (
              <div>
                <span className="text-foreground/50">Stack Trace:</span>
                <pre className="mt-1 text-[10px] text-foreground/70 whitespace-pre-wrap break-all">
                  {errorDetails.stack}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
