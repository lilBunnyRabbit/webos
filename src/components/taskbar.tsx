import { useWindows, useWindowsActions, WindowFlag } from "@/contexts/windows";
import { cn } from "@/lib/utils";
import { PanelBottom, PanelBottomCloseIcon, PanelLeft } from "lucide-react";
import { StartMenu } from "./start-menu";

interface TaskbarProps {
  orientation?: "horizontal" | "vertical";
  onToggleOrientation?: () => void;
}

export function Taskbar({ orientation = "vertical", onToggleOrientation }: TaskbarProps) {
  const { instances, index } = useWindows();
  const dispatch = useWindowsActions();

  // Get the focused window (last in instances array)
  const focusedWindowId = instances.length > 0 ? instances[instances.length - 1] : null;

  return (
    <div
      className={cn(
        "grid bg-background backdrop-blur-xl shadow-2xl py-1 px-2 border-t border-foreground/40 gap-2",
        orientation === "vertical"
          ? "grid-columns-1 grid-rows-[min-content_min-content_1fr_min-content_min-content]"
          : "grid-cols-[min-content_min-content_1fr_min-content_min-content] grid-rows-1"
      )}
    >
      {/* Start Menu */}
      <StartMenu />

      {/* Separator */}
      <div
        className={cn(
          "bg-foreground/10",
          orientation === "vertical" ? "w-8 h-px justify-self-center" : "w-px h-8 self-center"
        )}
      />

      <div
        className={cn(
          "flex items-center gap-1",
          orientation === "vertical" ? "flex-col overflow-y-auto" : "flex-row overflow-x-auto"
        )}
      >
        {[...instances]
          .sort((a, b) => index[a].createdAt.getTime() - index[b].createdAt.getTime())
          .map((windowId) => {
            const instance = index[windowId];
            const IconComponent = instance.app.icon;
            const isFocused = windowId === focusedWindowId;
            const isMinimized = instance.flags.has(WindowFlag.MINIMIZED);

            return (
              <button
                key={windowId}
                className={cn(
                  "group relative flex justify-center items-center gap-2 rounded-sm transition-all duration-150 min-w-0 flex-shrink-0 py-1 px-2 border border-transparent hover:bg-primary/10",
                  orientation === "vertical" ? "h-8" : "h-full",
                  isFocused && !isMinimized && "text-primary",
                  !isMinimized && "bg-primary/10"
                )}
                onClick={() => {
                  if (isMinimized || isFocused) {
                    dispatch({ type: "TOGGLE_WINDOW", windowId });
                  } else {
                    dispatch({ type: "FOCUS_WINDOW", windowId });
                  }
                }}
                title={instance.app.name}
              >
                <IconComponent className="w-4 h-4" />

                {orientation === "horizontal" && <div className="text-xs">{instance.app.name}</div>}
              </button>
            );
          })}
      </div>

      {/* Separator */}
      <div
        className={cn(
          "bg-foreground/10",
          orientation === "vertical" ? "w-8 h-px justify-self-center" : "w-px h-8 self-center"
        )}
      />

      {/* Start Menu */}
      <div
        className={cn(
          "flex items-center gap-1",
          orientation === "vertical" ? "flex-col overflow-y-auto" : "flex-row overflow-x-auto"
        )}
      >
        <button
          className="flex items-center justify-center hover:bg-primary/10 active:bg-primary/20 transition-colors rounded-sm w-10 h-10"
          onClick={() => dispatch({ type: "MINIMIZE_ALL_WINDOWS" })}
          title="Minimize all windows"
        >
          <PanelBottomCloseIcon className="w-6 h-6 text-foreground" />
        </button>

        {onToggleOrientation && (
          <button
            className="flex items-center justify-center hover:bg-primary/10 active:bg-primary/20 transition-colors rounded-sm w-10 h-10"
            onClick={onToggleOrientation}
            title={`Switch to ${orientation === "vertical" ? "horizontal" : "vertical"} taskbar`}
          >
            {orientation === "vertical" ? (
              <PanelBottom className="size-6 text-foreground" />
            ) : (
              <PanelLeft className="size-6 text-foreground" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// TODO: vibed
// export function Taskbar2({ orientation = "vertical", onToggleOrientation }: TaskbarProps) {
//   const { instances, index } = useWindows();
//   const dispatch = useWindowsActions();
//   const [currentTime, setCurrentTime] = useState(new Date());

//   // Update time every second
//   useEffect(() => {
//     const interval = setInterval(() => {
//       setCurrentTime(new Date());
//     }, 1000);
//     return () => clearInterval(interval);
//   }, []);

//   // Format time
//   const formatTime = (date: Date) => {
//     const hours = date.getHours();
//     const minutes = date.getMinutes();
//     const period = hours >= 12 ? "PM" : "AM";
//     const displayHours = hours % 12 || 12;
//     return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
//   };

//   // Format date
//   const formatDate = (date: Date) => {
//     return date.toLocaleDateString("en-US", {
//       month: "numeric",
//       day: "numeric",
//       year: "numeric",
//     });
//   };

//   // Get the focused window (last in instances array)
//   const focusedWindowId = instances.length > 0 ? instances[instances.length - 1] : null;

//   const isVertical = orientation === "vertical";

//   return (
//     <div className="relative">
//       {/* Taskbar */}
//       <div
//         className={`bg-background/80 backdrop-blur-xl shadow-2xl ${
//           isVertical
//             ? "border-r border-foreground/20 flex flex-col items-center py-2 w-16 h-full"
//             : "border-t border-foreground/20 flex items-center px-2 h-12"
//         }`}
//       >
//         {/* Start Menu */}
//         <StartMenu orientation={orientation} />

//         {/* Separator */}
//         <div className={`bg-foreground/10 ${isVertical ? "h-px w-8 my-1" : "w-px h-8 mx-1"}`} />

//         {/* App Icons */}
//         <div
//           className={`flex-1 flex gap-1 ${
//             isVertical
//               ? "flex-col items-center overflow-y-auto w-full scrollbar-thin scrollbar-thumb-foreground/20 scrollbar-track-transparent hover:scrollbar-thumb-foreground/30"
//               : "items-center overflow-x-auto scrollbar-thin scrollbar-thumb-foreground/20 scrollbar-track-transparent hover:scrollbar-thumb-foreground/30"
//           }`}
//         >
//           {[...instances]
//             .sort((a, b) => index[a].createdAt.getTime() - index[b].createdAt.getTime())
//             .map((windowId) => {
//               const windowInstance = index[windowId];
//               const appConfig = Apps[windowInstance.appId];
//               const IconComponent = appConfig.ICON;
//               const isFocused = windowId === focusedWindowId;
//               const isMinimized = windowInstance.isMinimized;

//               return (
//                 <button
//                   key={windowId}
//                   className={`
//                   group relative flex items-center gap-2 rounded-sm
//                   transition-all duration-150 min-w-0 flex-shrink-0
//                   ${isVertical ? "px-2 py-3 w-full flex-col" : "px-3 h-9"}
//                   ${
//                     !isMinimized
//                       ? "bg-primary/20 border border-primary/30"
//                       : "bg-background/40 hover:bg-foreground/5 border border-transparent"
//                   }
//                 `}
//                   onClick={() => {
//                     if (windowInstance.isMinimized || isFocused) {
//                       dispatch({ type: "TOGGLE_WINDOW", windowId });
//                     } else {
//                       dispatch({ type: "FOCUS_WINDOW", windowId });
//                     }
//                   }}
//                   title={`${appConfig.NAME}${isMinimized ? " (minimized)" : ""}`}
//                 >
//                   {/* Icon */}
//                   <div
//                     className={`flex-shrink-0 ${
//                       isFocused && !isMinimized ? "text-primary" : "text-foreground/70"
//                     } group-hover:scale-110 transition-transform`}
//                   >
//                     <IconComponent className="w-4 h-4" />
//                   </div>

//                   {/* App Name */}
//                   {!isVertical && (
//                     <span
//                       className={`text-xs font-medium truncate max-w-32 ${
//                         isFocused && !isMinimized ? "text-foreground" : "text-foreground/70"
//                       }`}
//                     >
//                       {appConfig.NAME}
//                     </span>
//                   )}

//                   {/* Active indicator */}
//                   {isFocused && !isMinimized && (
//                     <div
//                       className={`absolute bg-primary ${
//                         isVertical
//                           ? "left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-r-full"
//                           : "bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-t-full"
//                       }`}
//                     />
//                   )}

//                   {/* Close button on hover */}
//                   <div
//                     className={`flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
//                       isVertical ? "mt-1" : "ml-1"
//                     }`}
//                     onClick={(e) => {
//                       e.stopPropagation();
//                       dispatch({ type: "DESTROY_WINDOW", windowId });
//                     }}
//                   >
//                     <X className="w-3 h-3 text-foreground/50 hover:text-foreground" />
//                   </div>
//                 </button>
//               );
//             })}
//         </div>

//         {/* System Tray */}
//         <div className={`flex gap-2 ${isVertical ? "flex-col items-center mt-2" : "items-center ml-2"}`}>
//           {/* Separator */}
//           <div className={`bg-foreground/10 ${isVertical ? "h-px w-8" : "w-px h-8"}`} />

//           {/* Orientation Toggle */}
//           {onToggleOrientation && (
//             <button
//               className={`flex items-center justify-center ${
//                 isVertical ? "w-10 h-10" : "w-9 h-9"
//               } hover:bg-foreground/5 active:bg-foreground/10 rounded-sm transition-colors`}
//               onClick={onToggleOrientation}
//               title={`Switch to ${isVertical ? "horizontal" : "vertical"} taskbar`}
//             >
//               {isVertical ? (
//                 <PanelBottom className="w-4 h-4 text-foreground/70" />
//               ) : (
//                 <PanelLeft className="w-4 h-4 text-foreground/70" />
//               )}
//             </button>
//           )}

//           {/* Clock */}
//           <button
//             className={`flex ${
//               isVertical ? "flex-col items-center py-3 px-1" : "flex-col items-end px-3 py-1"
//             } hover:bg-foreground/5 rounded-sm transition-colors`}
//             title={`${formatTime(currentTime)} - ${formatDate(currentTime)}`}
//           >
//             <span
//               className={`text-xs font-medium text-foreground leading-tight ${isVertical ? "text-center" : ""}`}
//               style={isVertical ? { writingMode: "vertical-rl", textOrientation: "mixed" } : {}}
//             >
//               {formatTime(currentTime)}
//             </span>
//             {!isVertical && (
//               <span className="text-[10px] text-foreground/60 leading-tight">{formatDate(currentTime)}</span>
//             )}
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }
