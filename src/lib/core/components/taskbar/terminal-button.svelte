<script lang="ts">
  import kernel, { WindowFlag, type AppsService, type WindowsService } from "$lib/core/api";
  import { view_transition } from "$lib/core/utils/view-transition";
  import { cn } from "$lib/core/utils";
  import { TerminalWindow as TerminalWindowIcon } from "phosphor-svelte";

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  /** The most recently used Terminal window, if any. */
  const newest = $derived(
    windows
      .sorted_list(([, a], [, b]) => b.order - a.order)
      .find(([, instance]) => instance.app.id === "terminal")?.[0] ?? null
  );
  const focused = $derived(newest !== null && windows.is_focused(newest));

  /** Toggles like a taskbar item: brings the newest Terminal forward, hides it when it's already in front, opens one when none is running. */
  function toggle() {
    if (newest === null) return void apps.launch("terminal");
    const id = newest;
    if (focused || windows.get(id)?.flags.has(WindowFlag.MINIMIZED)) view_transition(() => windows.toggle_minimize(id));
    else windows.focus(id);
  }
</script>

<button
  aria-label="Terminal"
  title="Terminal (Alt+Shift+↵)"
  class={cn("grid size-(--taskbar-item) shrink-0 place-items-center rounded-xl transition-colors duration-150 hover:bg-foreground/10", focused && "bg-foreground/10")}
  onclick={toggle}
>
  <TerminalWindowIcon class="size-[calc(var(--taskbar-item)*0.5)]" weight={newest ? "fill" : "bold"} />
</button>
