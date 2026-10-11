<script lang="ts">
  import kernel, { type SettingsService, TaskbarPosition } from "$lib/core/api";
  import { Section, Segmented, SettingRow } from "$lib/core/components/ui";
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

  <Section title="Preview" flush>
    <div class="grid place-items-center rounded-xl bg-background-darker p-6 ring-1 ring-foreground/8">
      <div
        class={cn(
          "flex aspect-[16/10] w-full max-w-80 gap-1.5 rounded-lg bg-background-darkest p-1.5 ring-1 ring-foreground/12",
          {
            bottom: "flex-col-reverse",
            top: "flex-col",
            left: "flex-row",
            right: "flex-row-reverse",
          }[settings.taskbar.position]
        )}
      >
        <div class={cn("flex shrink-0 items-center gap-1 rounded-md bg-background-light p-1 transition-all duration-200", vertical ? "w-4 flex-col" : "h-4")}>
          <span class="size-2 rounded-xs bg-primary"></span>
          <span class="size-2 rounded-xs bg-foreground/30"></span>
          <span class="size-2 rounded-xs bg-foreground/30"></span>
        </div>
        <div class="relative flex-1">
          <div class="absolute top-[18%] left-[16%] h-1/2 w-1/2 rounded-sm bg-background shadow-raised ring-1 ring-foreground/10"></div>
        </div>
      </div>
    </div>
  </Section>
</div>
