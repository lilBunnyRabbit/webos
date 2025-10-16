import Apps, { type AppId } from "@/apps";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useApps } from "@/contexts/apps";
import { cn } from "@/lib/utils";
import { useDesktopStore } from "@/stores/desktop.store";
import {
  CalculatorIcon,
  GlobeIcon,
  ImageIcon,
  MailIcon,
  MusicIcon,
  PinIcon,
  PinOffIcon,
  VideoIcon,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "./ui/dialog";

// System apps that should appear at the bottom
const SYSTEM_APP_IDS = ["settings"];

// Dummy disabled apps for demonstration
const DUMMY_APPS = [
  { id: "browser", name: "Browser", icon: GlobeIcon, disabled: true },
  { id: "calculator", name: "Calculator", icon: CalculatorIcon, disabled: true },
  { id: "mail", name: "Mail", icon: MailIcon, disabled: true },
  { id: "photos", name: "Photos", icon: ImageIcon, disabled: true },
  { id: "music", name: "Music", icon: MusicIcon, disabled: true },
  { id: "videos", name: "Videos", icon: VideoIcon, disabled: true },
];

export function StartMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { open: openApp } = useApps();
  const desktopItems = useDesktopStore((state) => state.items);
  const addDesktopItem = useDesktopStore((state) => state.addItem);
  const removeDesktopItem = useDesktopStore((state) => state.removeItem);

  const handleOpenApp = (appId: AppId) => {
    openApp(appId);
    setOpen(false);
  };

  const handleToggleDesktop = (appId: AppId, e: React.MouseEvent) => {
    e.stopPropagation();
    if (desktopItems[appId]) {
      removeDesktopItem(appId);
    } else {
      addDesktopItem(appId);
    }
  };

  // Separate and sort apps, grouped by first letter
  const { groupedApps, systemApps } = useMemo(() => {
    type AppEntry = {
      id: string;
      name: string;
      icon: React.ComponentType<{ className?: string }>;
      disabled?: boolean;
    };

    const regular: AppEntry[] = [];
    const system: AppEntry[] = [];

    // Add real apps
    Object.entries(Apps).forEach(([appId, appConfig]) => {
      const entry: AppEntry = {
        id: appId,
        name: appConfig.NAME,
        icon: appConfig.ICON,
        disabled: false,
      };

      if (SYSTEM_APP_IDS.includes(appId)) {
        system.push(entry);
      } else {
        regular.push(entry);
      }
    });

    // Add dummy apps
    DUMMY_APPS.forEach((dummyApp) => {
      regular.push({
        id: dummyApp.id,
        name: dummyApp.name,
        icon: dummyApp.icon,
        disabled: dummyApp.disabled,
      });
    });

    // Sort alphabetically by name
    regular.sort((a, b) => a.name.localeCompare(b.name));
    system.sort((a, b) => a.name.localeCompare(b.name));

    // Group regular apps by first letter
    const grouped = new Map<string, AppEntry[]>();
    regular.forEach((app) => {
      const firstLetter = app.name.charAt(0).toUpperCase();
      if (!grouped.has(firstLetter)) {
        grouped.set(firstLetter, []);
      }
      grouped.get(firstLetter)!.push(app);
    });

    // Convert to sorted array of entries
    const sortedGroups = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    return { groupedApps: sortedGroups, systemApps: system };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="p-0 bg-background rounded-lg border border-foreground/40 h-[50dvh] overflow-hidden w-full !max-w-3xl"
      >
        <Command className="h-full">
          <CommandInput placeholder="Search applications..." />
          <CommandList className="max-h-full">
            <CommandEmpty>No applications found.</CommandEmpty>

            {/* Alphabetically Grouped Applications */}
            {groupedApps.map(([letter, apps]) => (
              <CommandGroup key={letter} heading={letter}>
                {apps.map((app) => {
                  const IconComponent = app.icon;
                  const isDisabled = app.disabled;
                  const isOnDesktop = !isDisabled && !!desktopItems[app.id as AppId];

                  return (
                    <CommandItem
                      key={app.id}
                      value={`${app.id} ${app.name}`}
                      onSelect={() => !isDisabled && handleOpenApp(app.id as AppId)}
                      disabled={isDisabled}
                      className={cn(!isDisabled && "cursor-pointer")}
                    >
                      <IconComponent className={cn(isDisabled ? "text-muted-foreground" : "text-primary")} />
                      <span className={cn(isDisabled && "text-muted-foreground")}>{app.name}</span>
                      {isDisabled && <span className="ml-auto text-xs text-muted-foreground italic">Coming soon</span>}
                      {!isDisabled && (
                        <button
                          className="ml-auto hover:bg-accent/20 p-1 rounded"
                          onClick={(e) => handleToggleDesktop(app.id as AppId, e)}
                          title={isOnDesktop ? "Remove from desktop" : "Add to desktop"}
                        >
                          {isOnDesktop ? (
                            <PinOffIcon className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <PinIcon className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}

            {/* Separator */}
            {systemApps.length > 0 && groupedApps.length > 0 && <CommandSeparator />}

            {/* System Applications */}
            {systemApps.length > 0 && (
              <CommandGroup heading="System">
                {systemApps.map((app) => {
                  const IconComponent = app.icon;
                  const isDisabled = app.disabled;
                  const isOnDesktop = !isDisabled && !!desktopItems[app.id as AppId];

                  return (
                    <CommandItem
                      key={app.id}
                      value={`${app.id} ${app.name}`}
                      onSelect={() => !isDisabled && handleOpenApp(app.id as AppId)}
                      disabled={isDisabled}
                      className={cn(!isDisabled && "cursor-pointer")}
                    >
                      <IconComponent className={cn(isDisabled ? "text-muted-foreground" : "text-primary")} />
                      <span className={cn(isDisabled && "text-muted-foreground")}>{app.name}</span>
                      {isDisabled && <span className="ml-auto text-xs text-muted-foreground italic">Coming soon</span>}
                      {!isDisabled && (
                        <button
                          className="ml-auto hover:bg-accent/20 p-1 rounded"
                          onClick={(e) => handleToggleDesktop(app.id as AppId, e)}
                          title={isOnDesktop ? "Remove from desktop" : "Add to desktop"}
                        >
                          {isOnDesktop ? (
                            <PinOffIcon className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <PinIcon className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
