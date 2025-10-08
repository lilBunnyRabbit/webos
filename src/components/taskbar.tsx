import { useWindows, useWindowsActions } from "@/contexts/windows";
import Apps, { type AppId } from "@/apps";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
// TODO: vibed
export function Taskbar() {
  const { instances, index } = useWindows();
  const dispatch = useWindowsActions();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [startMenuOpen, setStartMenuOpen] = useState(false);

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Format time
  const formatTime = (date: Date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
  };

  // Format date
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });
  };

  // Get the focused window (last in instances array)
  const focusedWindowId = instances.length > 0 ? instances[instances.length - 1] : null;

  return (
    <div className="relative">
      {/* Start Menu Overlay */}
      {startMenuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setStartMenuOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1 w-96 bg-background/95 backdrop-blur-xl border border-foreground/20 rounded-lg shadow-2xl z-50 overflow-hidden">
            <div className="p-4 border-b border-foreground/10">
              <h3 className="text-sm font-semibold text-foreground/70">Applications</h3>
            </div>
            <div className="p-2 max-h-96 overflow-y-auto">
              {Object.entries(Apps).map(([appId, appConfig]) => {
                const IconComponent = appConfig.ICON;
                return (
                  <button
                    key={appId}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-md hover:bg-primary/10 transition-colors text-left group"
                    onClick={() => {
                      dispatch({ type: "CREATE_WINDOW", appId: appId as AppId });
                      setStartMenuOpen(false);
                    }}
                  >
                    <div className="flex items-center justify-center w-8 h-8 text-primary group-hover:scale-110 transition-transform">
                      <IconComponent className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      {appConfig.NAME}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Taskbar */}
      <div className="bg-background/80 backdrop-blur-xl border-t border-foreground/20 shadow-2xl flex items-center px-2 h-12">
        {/* Start Button */}
        <button
          className={`flex items-center justify-center w-12 h-full hover:bg-primary/10 active:bg-primary/20 transition-colors rounded-sm ${
            startMenuOpen ? "bg-primary/20" : ""
          }`}
          onClick={() => setStartMenuOpen(!startMenuOpen)}
          title="Start"
        >
          <Menu className="w-5 h-5 text-primary" />
        </button>

        {/* Separator */}
        <div className="w-px h-8 bg-foreground/10 mx-1" />

        {/* App Icons */}
        <div className="flex-1 flex items-center gap-1 overflow-x-auto">
          {[...instances]
            .sort((a, b) => index[a].createdAt.getTime() - index[b].createdAt.getTime())
            .map((windowId) => {
              const windowInstance = index[windowId];
              const appConfig = Apps[windowInstance.appId];
              const IconComponent = appConfig.ICON;
              const isFocused = windowId === focusedWindowId;
              const isMinimized = windowInstance.isMinimized;

              return (
                <button
                  key={windowId}
                  className={`
                  group relative flex items-center gap-2 px-3 h-9 rounded-sm
                  transition-all duration-150 min-w-0
                  ${
                    !isMinimized
                      ? "bg-primary/20 border border-primary/30"
                      : "bg-background/40 hover:bg-foreground/5 border border-transparent"
                  }
                `}
                  onClick={() => {
                    if (windowInstance.isMinimized || isFocused) {
                      dispatch({ type: "TOGGLE_WINDOW", windowId });
                    } else {
                      dispatch({ type: "FOCUS_WINDOW", windowId });
                    }
                  }}
                  title={`${appConfig.NAME}${isMinimized ? " (minimized)" : ""}`}
                >
                  {/* Icon */}
                  <div
                    className={`flex-shrink-0 ${
                      isFocused && !isMinimized ? "text-primary" : "text-foreground/70"
                    } group-hover:scale-110 transition-transform`}
                  >
                    <IconComponent className="w-4 h-4" />
                  </div>

                  {/* App Name */}
                  <span
                    className={`text-xs font-medium truncate max-w-32 ${
                      isFocused && !isMinimized ? "text-foreground" : "text-foreground/70"
                    }`}
                  >
                    {appConfig.NAME}
                  </span>

                  {/* Active indicator */}
                  {isFocused && !isMinimized && (
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-t-full" />
                  )}

                  {/* Close button on hover */}
                  <div
                    className="flex-shrink-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "DESTROY_WINDOW", windowId });
                    }}
                  >
                    <X className="w-3 h-3 text-foreground/50 hover:text-foreground" />
                  </div>
                </button>
              );
            })}
        </div>

        {/* System Tray */}
        <div className="flex items-center gap-2 ml-2">
          {/* Separator */}
          <div className="w-px h-8 bg-foreground/10" />

          {/* Clock */}
          <button
            className="flex flex-col items-end px-3 py-1 hover:bg-foreground/5 rounded-sm transition-colors"
            title={`${formatTime(currentTime)} - ${formatDate(currentTime)}`}
          >
            <span className="text-xs font-medium text-foreground leading-tight">{formatTime(currentTime)}</span>
            <span className="text-[10px] text-foreground/60 leading-tight">{formatDate(currentTime)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
