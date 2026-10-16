<script lang="ts">
  import kernel, { type SettingsService, TaskbarPosition, TaskbarSize } from "$lib/core/api";
  import { Section, Segmented, SettingRow, Switch } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    ArrowLineDown as ArrowLineDownIcon,
    ArrowLineLeft as ArrowLineLeftIcon,
    ArrowLineRight as ArrowLineRightIcon,
    ArrowLineUp as ArrowLineUpIcon,
  } from "phosphor-svelte";

  const settings = $derived(kernel.service<SettingsService>("settings"));

  const OPTIONS = [
    { value: TaskbarPosition.BOTTOM, label: "Bottom", icon: ArrowLineDownIcon },
    { value: TaskbarPosition.TOP, label: "Top", icon: ArrowLineUpIcon },
    { value: TaskbarPosition.LEFT, label: "Left", icon: ArrowLineLeftIcon },
    { value: TaskbarPosition.RIGHT, label: "Right", icon: ArrowLineRightIcon },
  ];

  const SIZES = [
    { value: TaskbarSize.SMALL, label: "Small" },
    { value: TaskbarSize.MEDIUM, label: "Medium" },
    { value: TaskbarSize.LARGE, label: "Large" },
  ];

  const vertical = $derived(settings.taskbar.position === "left" || settings.taskbar.position === "right");
</script>

<div class="flex flex-col gap-8">
  <Section title="Position" description="Which screen edge the taskbar docks to.">
    <SettingRow label="Dock to" description="Windows resize to the space that's left.">
      {#snippet children({ id, describedby })}
        <Segmented {id} aria-describedby={describedby} label="Taskbar position" bind:value={settings.taskbar.position} options={OPTIONS} />
      {/snippet}
    </SettingRow>
  </Section>

  <Section title="Size and hiding">
    <SettingRow label="Size" description="Buttons, icons and the bar itself.">
      {#snippet children({ id, describedby })}
        <Segmented {id} aria-describedby={describedby} label="Taskbar size" bind:value={settings.taskbar.size} options={SIZES} />
      {/snippet}
    </SettingRow>
    <SettingRow label="Auto-hide" description="Windows get the whole screen. Point at the edge to bring the taskbar back.">
      {#snippet children({ id, describedby })}
        <Switch {id} aria-describedby={describedby} bind:checked={settings.taskbar.auto_hide} />
      {/snippet}
    </SettingRow>
  </Section>

  <Section title="Preview" flush>
    <div class="grid place-items-center rounded-xl bg-background-darker p-6 ring-1 ring-foreground/8">
      <div
        class={cn(
          "relative flex aspect-[16/10] w-full max-w-80 gap-1.5 rounded-lg bg-background-darkest p-1.5 ring-1 ring-foreground/12",
          {
            bottom: "flex-col-reverse",
            top: "flex-col",
            left: "flex-row",
            right: "flex-row-reverse",
          }[settings.taskbar.position]
        )}
      >
        <div
          class={cn(
            "flex shrink-0 items-center gap-1 rounded-md bg-background-light p-1 transition-all duration-200",
            vertical ? cn("flex-col", { small: "w-3.5", medium: "w-4", large: "w-5" }[settings.taskbar.size]) : { small: "h-3.5", medium: "h-4", large: "h-5" }[settings.taskbar.size],
            settings.taskbar.auto_hide &&
              cn("absolute z-1 opacity-50", { bottom: "inset-x-1.5 bottom-0.5", top: "inset-x-1.5 top-0.5", left: "inset-y-1.5 left-0.5", right: "inset-y-1.5 right-0.5" }[settings.taskbar.position])
          )}
        >
          {#each ["bg-primary", "bg-foreground/30", "bg-foreground/30"] as fill, index (index)}
            <span class={cn("shrink-0 rounded-xs", fill, { small: "size-1.5", medium: "size-2", large: "size-3" }[settings.taskbar.size])}></span>
          {/each}
        </div>
        <div class="relative flex-1">
          <div class="absolute top-[18%] left-[16%] h-1/2 w-1/2 rounded-sm bg-background shadow-raised ring-1 ring-foreground/10"></div>
        </div>
      </div>
    </div>
  </Section>
</div>
