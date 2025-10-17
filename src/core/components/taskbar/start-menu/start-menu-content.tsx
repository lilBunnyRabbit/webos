import Apps, { type AppId } from "@/apps";
import { AppTag, useApps } from "@/core/contexts/apps";
import { cn } from "@/core/lib/utils";
import { useDesktopStore } from "@/core/stores/desktop.store";
import { Command } from "cmdk";
import {
  ActivityIcon,
  BookOpenIcon,
  BrainIcon,
  CircleDotIcon,
  ClockIcon,
  DownloadIcon,
  FileTextIcon,
  GridIcon,
  ImageIcon,
  PackageIcon,
  PaletteIcon,
  PinIcon,
  PinOffIcon,
  PuzzleIcon,
  SearchIcon,
  Share2Icon,
  SquareIcon,
  TerminalIcon,
  TvIcon,
  VideoIcon,
  WandIcon,
  ZapIcon,
} from "lucide-react";
import React, { useMemo } from "react";

// Tag display labels
const TAG_LABELS: Record<string, string> = {
  [AppTag.UTILITY]: "Utilities",
  [AppTag.GAME]: "Games",
  [AppTag.SYSTEM]: "System",
};

const COMING_SOON_APPS = [
  // Productivity & Utilities
  { id: "notes", name: "Quick Notes", icon: FileTextIcon, disabled: true, tags: [AppTag.UTILITY] },
  { id: "speed-reader", name: "Speed Reader", icon: BookOpenIcon, disabled: true, tags: [AppTag.UTILITY] },
  { id: "work-hours", name: "Work Hours", icon: ClockIcon, disabled: true, tags: [AppTag.UTILITY] },
  { id: "color-tools", name: "Color Tools", icon: PaletteIcon, disabled: true, tags: [AppTag.UTILITY] },

  // Media & Tools
  { id: "series-tracker", name: "Series Tracker", icon: TvIcon, disabled: true, tags: [AppTag.UTILITY] },
  { id: "image-editor", name: "Image Editor", icon: ImageIcon, disabled: true, tags: [AppTag.UTILITY] },
  { id: "video-editor", name: "Video Editor", icon: VideoIcon, disabled: true, tags: [AppTag.UTILITY] },
  { id: "gif-maker", name: "GIF Maker", icon: WandIcon, disabled: true, tags: [AppTag.UTILITY] },
  { id: "pdf-tools", name: "PDF Tools", icon: FileTextIcon, disabled: true, tags: [AppTag.UTILITY] },

  // Advanced Tools
  { id: "compression", name: "Compression", icon: PackageIcon, disabled: true, tags: [AppTag.UTILITY] },
  { id: "file-transfer", name: "File Transfer", icon: Share2Icon, disabled: true, tags: [AppTag.UTILITY] },
  { id: "downloader", name: "Downloader", icon: DownloadIcon, disabled: true, tags: [AppTag.UTILITY] },
  { id: "rng-tools", name: "RNG Tools", icon: ZapIcon, disabled: true, tags: [AppTag.UTILITY] },

  // Games
  { id: "nonogram", name: "Nonogram", icon: GridIcon, disabled: true, tags: [AppTag.GAME] },
  { id: "kakuro", name: "Kakuro", icon: PuzzleIcon, disabled: true, tags: [AppTag.GAME] },
  { id: "word-search", name: "Word Search", icon: SearchIcon, disabled: true, tags: [AppTag.GAME] },
  { id: "maze", name: "Maze", icon: SquareIcon, disabled: true, tags: [AppTag.GAME] },
  { id: "sudoku", name: "Sudoku", icon: GridIcon, disabled: true, tags: [AppTag.GAME] },
  { id: "minesweeper", name: "Minesweeper", icon: CircleDotIcon, disabled: true, tags: [AppTag.GAME] },
  { id: "chess", name: "Chess", icon: BrainIcon, disabled: true, tags: [AppTag.GAME] },

  // System
  { id: "task-manager", name: "Task Manager", icon: ActivityIcon, disabled: true, tags: [AppTag.SYSTEM] },
  { id: "terminal", name: "Terminal", icon: TerminalIcon, disabled: true, tags: [AppTag.SYSTEM] },
];

interface StartMenuContentProps {
  onClose: () => void;
}

// TODO: Styling, logic refactor

export const StartMenuContent = ({ onClose }: StartMenuContentProps) => {
  const { open: openApp } = useApps();
  const desktopItems = useDesktopStore((state) => state.items);
  const addDesktopItem = useDesktopStore((state) => state.addItem);
  const removeDesktopItem = useDesktopStore((state) => state.removeItem);

  const handleOpenApp = (appId: AppId) => {
    openApp(appId);
    onClose();
  };

  const handleToggleDesktop = (appId: AppId, e: React.MouseEvent) => {
    e.stopPropagation();
    if (desktopItems[appId]) {
      removeDesktopItem(appId);
    } else {
      addDesktopItem(appId);
    }
  };

  // Group apps by tags
  const groupedAppsByTag = useMemo(() => {
    type AppEntry = {
      id: string;
      name: string;
      icon: React.ComponentType<{ className?: string }>;
      disabled?: boolean;
      tags: readonly string[];
    };

    // Collect all apps (real + dummy)
    const allApps: AppEntry[] = [];

    // Add real apps
    Object.entries(Apps).forEach(([appId, appConfig]) => {
      allApps.push({
        id: appId,
        name: appConfig.NAME,
        icon: appConfig.ICON,
        disabled: false,
        tags: appConfig.TAGS || [],
      });
    });

    // Add dummy apps
    COMING_SOON_APPS.forEach((dummyApp) => {
      allApps.push({
        id: dummyApp.id,
        name: dummyApp.name,
        icon: dummyApp.icon,
        disabled: dummyApp.disabled,
        tags: dummyApp.tags,
      });
    });

    // Group apps by tag
    const groupedByTag = new Map<string, AppEntry[]>();

    allApps.forEach((app) => {
      // An app can have multiple tags, add it to each tag group
      app.tags.forEach((tag) => {
        if (!groupedByTag.has(tag)) {
          groupedByTag.set(tag, []);
        }
        groupedByTag.get(tag)!.push(app);
      });
    });

    // Sort apps within each tag group alphabetically
    groupedByTag.forEach((apps) => {
      apps.sort((a, b) => a.name.localeCompare(b.name));
    });

    // Return ordered groups based on AppTag key order
    const tagOrder = Object.values(AppTag);
    return tagOrder
      .map((tag) => ({
        tag,
        label: TAG_LABELS[tag] || tag,
        apps: groupedByTag.get(tag) || [],
      }))
      .filter((group) => group.apps.length > 0);
  }, []);

  return (
    <Command data-slot="command" className="flex h-full w-full flex-col overflow-hidden">
      <div
        data-slot="command-input-wrapper"
        className="flex h-12 items-center gap-2 px-3 bg-foreground text-background shrink-0"
      >
        <SearchIcon className="size-4 shrink-0" />
        <Command.Input
          data-slot="command-input"
          placeholder="Search applications..."
          className="placeholder:text-background/70 flex h-10 w-full rounded-md bg-transparent py-3 outline-hidden disabled:cursor-not-allowed disabled:opacity-50 text-base"
        />
      </div>

      <Command.List
        data-slot="command-list"
        className="max-h-full h-full flex-1 scroll-py-1 overflow-x-hidden overflow-y-auto px-2 pb-2 bg-background rounded-t-sm"
      >
        <Command.Empty data-slot="command-empty" className="py-6 text-center text-sm">
          No applications found.
        </Command.Empty>

        {/* Applications Grouped by Tags */}
        {groupedAppsByTag.map((group, index) => (
          <React.Fragment key={group.tag}>
            {index > 0 && (
              <Command.Separator data-slot="command-separator" className={cn("bg-border -mx-1 h-px", "my-2")} />
            )}
            <Command.Group
              data-slot="command-group"
              heading={group.label}
              className="text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium mb-2"
            >
              {group.apps.map((app) => {
                const IconComponent = app.icon;
                const isDisabled = app.disabled;
                const isOnDesktop = !isDisabled && !!desktopItems[app.id as AppId];

                return (
                  <Command.Item
                    key={app.id}
                    data-slot="command-item"
                    className={cn(
                      "data-[selected=true]:bg-primary/20 data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 py-3 px-3 rounded-sm transition-all duration-150",
                      !isDisabled && "cursor-pointer",
                      !isDisabled && "hover:bg-primary/15 data-[selected=true]:bg-primary/20",
                      isDisabled && "opacity-60"
                    )}
                    value={`${app.id} ${app.name}`}
                    onSelect={() => !isDisabled && handleOpenApp(app.id as AppId)}
                    disabled={isDisabled}
                  >
                    <IconComponent className={cn("!size-5", isDisabled ? "text-muted-foreground" : "text-primary")} />
                    <span className={cn("font-medium", isDisabled && "text-muted-foreground")}>{app.name}</span>
                    {isDisabled && (
                      <span className="ml-auto text-xs text-muted-foreground/70 italic font-normal">Coming soon</span>
                    )}
                    {!isDisabled && (
                      <button
                        className={cn(
                          "ml-auto p-1.5 rounded-sm transition-all duration-150",
                          "hover:bg-foreground/10 active:bg-foreground/20",
                          isOnDesktop && "bg-primary/20"
                        )}
                        onClick={(e) => handleToggleDesktop(app.id as AppId, e)}
                        title={isOnDesktop ? "Remove from desktop" : "Add to desktop"}
                      >
                        {isOnDesktop ? (
                          <PinOffIcon className="h-4 w-4 text-primary" />
                        ) : (
                          <PinIcon className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        )}
                      </button>
                    )}
                  </Command.Item>
                );
              })}
            </Command.Group>
          </React.Fragment>
        ))}
      </Command.List>
    </Command>
  );
};
