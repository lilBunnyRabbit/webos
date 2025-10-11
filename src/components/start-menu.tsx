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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useWindowsActions } from "@/contexts/windows";
import { cn } from "@/lib/utils";
import {
  CalculatorIcon,
  FolderIcon,
  GlobeIcon,
  ImageIcon,
  LayoutGridIcon,
  MailIcon,
  MusicIcon,
  VideoIcon,
} from "lucide-react";
import React, { useMemo, useState } from "react";

// System apps that should appear at the bottom
const SYSTEM_APP_IDS = ["settings"];

// Dummy disabled apps for demonstration
const DUMMY_APPS = [
  { id: "browser", name: "Browser", icon: GlobeIcon, disabled: true },
  { id: "calculator", name: "Calculator", icon: CalculatorIcon, disabled: true },
  { id: "mail", name: "Mail", icon: MailIcon, disabled: true },
  { id: "photos", name: "Photos", icon: ImageIcon, disabled: true },
  { id: "files", name: "Files", icon: FolderIcon, disabled: true },
  { id: "music", name: "Music", icon: MusicIcon, disabled: true },
  { id: "videos", name: "Videos", icon: VideoIcon, disabled: true },
];

export function StartMenu() {
  const [open, setOpen] = useState(false);
  const dispatch = useWindowsActions();

  const handleOpenApp = (appId: AppId) => {
    dispatch({ type: "CREATE_WINDOW", appId });
    setOpen(false);
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center justify-center hover:bg-primary/10 active:bg-primary/20 transition-colors rounded-sm w-10 h-10",
            open && "bg-primary/20"
          )}
          title="Start"
        >
          <LayoutGridIcon className="w-6 h-6 text-primary" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-96 bg-background rounded border border-foreground/40"
        align="start"
        side="top"
        alignOffset={2}
        sideOffset={16}
      >
        <Command>
          <CommandInput placeholder="Search applications..." />
          <CommandList>
            <CommandEmpty>No applications found.</CommandEmpty>

            {/* Alphabetically Grouped Applications */}
            {groupedApps.map(([letter, apps]) => (
              <CommandGroup key={letter} heading={letter}>
                {apps.map((app) => {
                  const IconComponent = app.icon;
                  const isDisabled = app.disabled;

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
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
