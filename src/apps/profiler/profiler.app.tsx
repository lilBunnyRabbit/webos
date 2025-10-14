import { profilerEmitter } from "@/emitters/profiler.emitter";
import { Button } from "@/components/ui/button";
import React from "react";
import type { AppId } from "@/apps";
import type { WindowId } from "@/contexts/windows";
import { ID } from ".";
import type { ProfilerEvents } from "@/emitters/profiler.emitter";

interface RenderingData {
  rendersCount: number;
  totalDuration: number;
  maxDuration: number;
}

type RendersData = Array<{
  phase: ProfilerEvents["render"]["payload"][1];
  duration: number;
  commitTime: number;
}>;

interface ProfilerState {
  renders: RendersData;
  renderingData: RenderingData;

  state: Partial<
    Record<
      AppId,
      RenderingData & {
        windows: Record<
          WindowId,
          RenderingData & {
            renders: RendersData;
          }
        >;
      }
    >
  >;
}

const MAX_WINDOW_RENDER_COUNT = 20;
const MAX_GLOBAL_RENDER_COUNT = 100;

interface ProfilerAction {
  type: "RENDER_EVENT";
  event: ProfilerEvents["render"];
}

const profilerReducer = (state: ProfilerState, action: ProfilerAction) => {
  switch (action.type) {
    case "RENDER_EVENT": {
      const [, phase, duration, , , commitTime] = action.event.payload;

      const lastGlobalRender = state.renders[state.renders.length - 1];
      const globalRenders =
        lastGlobalRender?.commitTime === commitTime
          ? [
              ...state.renders.slice(0, -1),
              {
                ...lastGlobalRender,
                duration: duration + lastGlobalRender.duration,
              },
            ]
          : [...state.renders, { phase, duration, commitTime }];

      const appData: NonNullable<ProfilerState["state"][AppId]> = state.state[action.event.appId]
        ? { ...state.state[action.event.appId]! }
        : {
            rendersCount: 0,
            totalDuration: 0,
            maxDuration: 0,
            windows: {},
          };
      appData.rendersCount += 1;
      appData.totalDuration += duration;
      appData.maxDuration = Math.max(appData.maxDuration, duration);

      const windowData = appData.windows[action.event.windowId]
        ? { ...appData.windows[action.event.windowId] }
        : {
            rendersCount: 0,
            renders: [],
            totalDuration: 0,
            maxDuration: 0,
          };
      windowData.rendersCount += 1;
      windowData.totalDuration += duration;
      windowData.maxDuration = Math.max(windowData.maxDuration, duration);
      windowData.renders = [...windowData.renders, { phase, duration, commitTime }].slice(-MAX_WINDOW_RENDER_COUNT);

      // Update appData.windows with the modified windowData
      appData.windows = {
        ...appData.windows,
        [action.event.windowId]: windowData,
      };

      return {
        ...state,
        renderingData: {
          rendersCount: state.renderingData.rendersCount + 1,
          totalDuration: state.renderingData.totalDuration + duration,
          maxDuration: Math.max(
            state.renderingData.maxDuration,
            globalRenders[globalRenders.length - 1]?.duration ?? 0
          ),
        },
        renders: globalRenders.slice(-MAX_GLOBAL_RENDER_COUNT),
        state: {
          ...state.state,
          [action.event.appId]: appData,
        },
      };
    }
  }
};

export default function ProfilerApp() {
  const [{ renderingData, renders, state }, dispatch] = React.useReducer(profilerReducer, {
    renderingData: {
      rendersCount: 0,
      totalDuration: 0,
      maxDuration: 0,
    },
    renders: [],
    state: {},
  });

  React.useEffect(() => {
    const handleRender = (event: ProfilerEvents["render"]) => {
      // Ignore the profiler app's own render events to prevent infinite loops
      if (event.appId === ID) return;

      dispatch({ type: "RENDER_EVENT", event });
    };

    profilerEmitter.on("render", handleRender);

    return () => {
      profilerEmitter.off("render", handleRender);
    };
  }, []);

  return <ProfilerApp2 renderingData={renderingData} renders={renders} state={state} />;
}

// Color palette for apps
const APP_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-yellow-500",
  "bg-red-500",
];

interface ProfilerApp2Props {
  renderingData: RenderingData;
  renders: RendersData;
  state: ProfilerState["state"];
}

function ProfilerApp2({ renderingData, renders, state }: ProfilerApp2Props) {
  const handleExport = () => {
    const dataStr = JSON.stringify({ renderingData, renders, state }, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `profiler-data-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Sort apps by total duration
  const sortedAppIds = React.useMemo(() => {
    return Object.entries(state)
      .map(([appId, data]) => ({
        appId,
        totalDuration: data?.totalDuration || 0,
      }))
      .sort((a, b) => b.totalDuration - a.totalDuration)
      .map((item) => item.appId);
  }, [state]);

  // Global metrics
  const totalApps = sortedAppIds.length;
  const totalWindows = React.useMemo(() => {
    return Object.values(state).reduce((sum, appData) => {
      return sum + (appData ? Object.keys(appData.windows).length : 0);
    }, 0);
  }, [state]);

  // Assign colors to apps
  const appColorMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    sortedAppIds.forEach((appId, idx) => {
      map[appId] = APP_COLORS[idx % APP_COLORS.length];
    });
    return map;
  }, [sortedAppIds]);

  // Normalize scale
  const NORMALIZED_SCALE_MS = renderingData.maxDuration || 1000;

  return (
    <div className="h-full flex flex-col p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Performance Profiler</h1>
          <p className="text-xs text-muted-foreground">
            {totalApps} app(s) • {totalWindows} window(s) • {renderingData.rendersCount} renders
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExport} variant="outline" size="sm" disabled={totalApps === 0}>
            📥 Export
          </Button>
        </div>
      </div>

      {sortedAppIds.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-sm">Open apps and interact with them to see metrics</p>
          </div>
        </div>
      ) : (
        <>
          {/* Global Overview Chart - Recent Renders Timeline */}
          <div className="border rounded-lg p-3 bg-card">
            <div className="text-xs font-medium mb-2">
              Global Activity (Last {renders.length} renders)
              <span className="text-muted-foreground ml-2">Scale: 0-{NORMALIZED_SCALE_MS}ms</span>
              {renderingData.maxDuration > 0 && (
                <span className="text-muted-foreground ml-2">• Peak: {renderingData.maxDuration.toFixed(1)}ms</span>
              )}
            </div>
            <div
              className="grid items-end gap-px h-24 bg-muted/30 rounded px-1"
              style={{ gridTemplateColumns: `repeat(${MAX_GLOBAL_RENDER_COUNT},minmax(1px,1fr))` }}
            >
              {renders.map((interval, idx) => {
                const height = (interval.duration / NORMALIZED_SCALE_MS) * 100;
                const hasData = interval.duration > 0;
                const phaseColor =
                  interval.phase === ("mount" as const)
                    ? "bg-green-500"
                    : interval.phase === "update"
                    ? "bg-blue-400"
                    : "bg-yellow-500";

                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col-reverse min-w-[1px]"
                    style={{
                      height: `${Math.max(height, hasData ? 2 : 0)}%`,
                      gridColumn: `${MAX_GLOBAL_RENDER_COUNT - renders.length + idx + 1} / ${
                        MAX_GLOBAL_RENDER_COUNT - renders.length + idx + 2
                      }`,
                    }}
                    title={
                      hasData
                        ? `${interval.duration.toFixed(1)}ms (${interval.duration} render${
                            interval.duration !== 1 ? "s" : ""
                          })`
                        : "No activity"
                    }
                  >
                    <div className={`${phaseColor} hover:opacity-80 h-full`} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>oldest</span>
              <span>newest</span>
            </div>
          </div>

          {/* Grouped App Stats */}
          <div className="flex-1">
            <div className="space-y-3">
              {sortedAppIds.map((appId) => {
                const appData = state[appId as AppId];
                if (!appData) return null;

                const appColor = appColorMap[appId];
                const windows = Object.entries(appData.windows);

                return (
                  <div key={appId} className="border rounded-lg p-3 bg-card">
                    {/* App Header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${appColor}`} />
                        <span className="font-semibold text-sm capitalize">{appId}</span>
                        <span className="text-xs text-muted-foreground">
                          ({windows.length} window{windows.length !== 1 ? "s" : ""})
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Total: {appData.totalDuration.toFixed(1)}ms • {appData.rendersCount} renders • Max:{" "}
                        {appData.maxDuration.toFixed(2)}ms
                      </div>
                    </div>

                    {/* Windows for this app */}
                    <div className="space-y-1.5">
                      {windows.map(([windowId, windowData]) => {
                        const typedWindowData = windowData as RenderingData & { renders: RendersData };
                        const avgDuration =
                          typedWindowData.rendersCount > 0
                            ? typedWindowData.totalDuration / typedWindowData.rendersCount
                            : 0;

                        return (
                          <div
                            key={windowId}
                            className="flex items-center gap-2 p-1.5 rounded bg-muted/30 hover:bg-muted/50"
                          >
                            {/* Window ID */}
                            <div className="min-w-[100px] text-xs font-mono text-muted-foreground truncate">
                              {windowId.slice(0, 12)}...
                            </div>

                            {/* Metrics */}
                            <div className="flex-1 grid grid-cols-4 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">Total: </span>
                                <span className="font-semibold">{typedWindowData.totalDuration.toFixed(1)}ms</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Avg: </span>
                                <span className="font-semibold">{avgDuration.toFixed(2)}ms</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Max: </span>
                                <span className="font-semibold">{typedWindowData.maxDuration.toFixed(2)}ms</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Renders: </span>
                                <span className="font-semibold">{typedWindowData.rendersCount}</span>
                              </div>
                            </div>

                            {/* Mini Chart */}
                            <div className="flex flex-col items-center gap-0.5">
                              <div
                                className="grid items-end gap-0.5 h-6 w-24"
                                style={{ gridTemplateColumns: `repeat(${MAX_WINDOW_RENDER_COUNT},minmax(1px,1fr))` }}
                              >
                                {typedWindowData.renders.map((render, renderIdx: number) => {
                                  // Normalize to max value in this window's render history
                                  const localMax = typedWindowData.maxDuration || render.duration || 1;
                                  const height = (render.duration / localMax) * 100;
                                  const phaseColor =
                                    render.phase === "mount"
                                      ? "bg-green-500"
                                      : render.phase === "update"
                                      ? "bg-blue-400"
                                      : "bg-yellow-500";
                                  return (
                                    <div
                                      key={renderIdx}
                                      className={`flex-1 ${phaseColor} min-w-[1px] hover:opacity-70`}
                                      style={{
                                        height: `${Math.max(height, 5)}%`,
                                        gridColumn: `${
                                          MAX_WINDOW_RENDER_COUNT - typedWindowData.renders.length + renderIdx + 1
                                        } / ${
                                          MAX_WINDOW_RENDER_COUNT - typedWindowData.renders.length + renderIdx + 2
                                        }`,
                                      }}
                                      title={`${render.phase}: ${render.duration.toFixed(2)}ms`}
                                    />
                                  );
                                })}
                              </div>
                              <div className="text-[9px] text-muted-foreground">
                                max: {typedWindowData.maxDuration.toFixed(1)}ms
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
