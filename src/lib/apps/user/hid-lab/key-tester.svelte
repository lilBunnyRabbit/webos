<script lang="ts">
  import { onMount } from "svelte";
  import { z } from "zod";
  import kernel, { type ShortcutsService } from "$lib/core/api";
  import { Button, Kbd, Section, Segmented } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, ArrowDown as ArrowDownIcon, ArrowUp as ArrowUpIcon, TextT as TextTIcon } from "phosphor-svelte";
  import KeyHeatmap from "./key-heatmap.svelte";
  import { key_text, layout_map, location_name, Shape } from "./keys";
  import { EntryType, KeyTester } from "./tester.svelte";

  const { window: win, storage } = get_app_context();
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));

  const tester = new KeyTester(kernel.service<ShortcutsService>("shortcuts").mac);
  const shape = storage.persisted("shape", Shape.ANSI as Shape, z.enum(Shape));
  let layout = $state.raw<ReadonlyMap<string, string> | null>(null);
  let capture: HTMLTextAreaElement | null = $state(null);
  let focused = $state(false);
  let last_escape = -Infinity;

  const ESCAPE_TWICE_MS = 600;

  $effect(() => {
    if (!focused || !win.is_focused || !win.is_visible) return;
    return shortcuts.suspend();
  });

  onMount(() => {
    void layout_map().then((map) => (layout = map));
  });

  $effect(() => {
    if (tester.presses.has("IntlBackslash")) shape.value = Shape.ISO;
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    event.preventDefault();
    tester.down(event);
    if (event.key === "Escape" && !event.repeat) {
      if (event.timeStamp - last_escape < ESCAPE_TWICE_MS) capture?.blur();
      last_escape = event.timeStamp;
    }
  }

  function onkeyup(event: KeyboardEvent) {
    if (event.isComposing) return;
    event.preventDefault();
    tester.up(event);
  }

  // On-screen keyboards send keydown as "Unidentified" and type anyway; the text they insert is all there is to show.
  function oninput(event: Event) {
    const data = (event as InputEvent).data;
    if (data) tester.input(data, event.timeStamp);
    if (capture) capture.value = "";
  }

  function onfocus() {
    focused = true;
    void layout_map().then((map) => (layout = map ?? layout));
  }

  function onblur() {
    focused = false;
    tester.release();
  }

  const last = $derived(tester.last);
  const last_up = $derived(tester.log.find((entry) => entry.type === EntryType.UP && entry.held_ms !== null));
  const held = $derived([...tester.held.entries()]);

  function ms(value: number): string {
    return `${Math.round(value)} ms`;
  }
</script>

<div class="flex flex-col gap-6">
  <div
    class={cn(
      "relative flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl p-4 text-center ring-inset transition-[box-shadow] duration-150",
      "bg-field shadow-recessed",
      focused ? "ring-2 ring-cottontail" : "ring-1 ring-transparent hover:ring-edge"
    )}
  >
    <textarea
      bind:this={capture}
      class="absolute inset-0 size-full cursor-pointer resize-none rounded-xl bg-transparent text-transparent caret-transparent outline-none"
      aria-label="Key capture area: press keys to test them"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      {onkeydown}
      {onkeyup}
      {oninput}
      {onfocus}
      {onblur}
    ></textarea>
    {#if last}
      <p class="pointer-events-none font-mono text-4xl font-semibold break-all">{key_text(last.key)}</p>
      <p class="pointer-events-none font-mono text-ui text-foreground/65">{last.code || "no code"}</p>
    {:else}
      <p class="pointer-events-none text-sm font-medium">{focused ? "Press any key" : "Click or tap here, then press keys"}</p>
    {/if}
    <p class="pointer-events-none text-ui text-foreground/65">
      {#if focused}
        OS shortcuts are paused while this has focus. Press Esc twice to leave.
      {:else}
        Not listening.
      {/if}
    </p>
  </div>

  <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-ui @md:grid-cols-3 @xl:grid-cols-6">
    {#snippet stat(label: string, value: string)}
      <div class="min-w-0">
        <dt class="text-foreground/65">{label}</dt>
        <dd class="truncate font-mono">{value}</dd>
      </div>
    {/snippet}
    {@render stat("Key", last ? key_text(last.key) : "—")}
    {@render stat("Code", last?.code || "—")}
    {@render stat("Location", last ? location_name(last.location) : "—")}
    {@render stat("Modifiers", last?.modifiers.join(" + ") || "none")}
    {@render stat("Repeats", String(tester.repeats))}
    {@render stat("Last hold", last_up?.held_ms != null ? ms(last_up.held_ms) : "—")}
  </dl>

  <Section title="Held now" description="Keys down at this moment. Hold several to find the keyboard's rollover limit.">
    <div class="flex flex-col gap-2 px-4 py-3">
      <div class="flex min-h-6 flex-wrap items-center gap-1.5">
        {#each held as [code, entry] (code)}
          <Kbd>{key_text(entry.key)} · {code}</Kbd>
        {:else}
          <span class="text-ui text-foreground/65">Nothing held</span>
        {/each}
      </div>
      <p class="text-ui text-foreground/65">
        {held.length} held · most at once: {tester.max_held}. If a key you're holding doesn't appear, the keyboard dropped it: that's its rollover
        limit, or ghosting when only some combinations fail. Many keyboards handle 6 keys plus modifiers.
      </p>
    </div>
  </Section>

  <Section title="Layout" description="{tester.presses.size} keys tested. Darker means pressed more often.">
    {#snippet actions()}
      <Segmented
        size="sm"
        label="Keyboard shape"
        options={[
          { value: Shape.ANSI, label: "ANSI" },
          { value: Shape.ISO, label: "ISO" },
        ]}
        bind:value={shape.value}
      />
      <Button size="sm" variant="quiet" onclick={() => tester.reset()} aria-label="Reset">
        <ArrowCounterClockwiseIcon class="size-4" /> <span class="hidden @md:inline">Reset</span>
      </Button>
    {/snippet}
    <div class="p-3">
      <KeyHeatmap shape={shape.value} presses={tester.presses} held={tester.held} {layout} mac={shortcuts.mac} />
    </div>
  </Section>

  <Section title="Events" description="Newest first. Hold time is keydown to keyup.">
    <div class="max-h-72 overflow-auto">
      <table class="w-full text-left text-ui">
        <thead class="sticky top-0 bg-background-light text-foreground/65">
          <tr>
            <th class="w-8 px-3 py-1.5 font-medium"><span class="sr-only">Type</span></th>
            <th class="px-2 py-1.5 font-medium">Key</th>
            <th class="px-2 py-1.5 font-medium">Code</th>
            <th class="hidden px-2 py-1.5 font-medium @md:table-cell">Location</th>
            <th class="hidden px-2 py-1.5 font-medium @lg:table-cell">Modifiers</th>
            <th class="px-3 py-1.5 text-right font-medium">Hold</th>
          </tr>
        </thead>
        <tbody class="font-mono">
          {#each tester.log as entry (entry.id)}
            <tr class={cn("border-t border-hairline", entry.repeat && "text-foreground/65")}>
              <td class="px-3 py-1">
                {#if entry.type === EntryType.DOWN}
                  <ArrowDownIcon class="size-3.5" aria-label="down" />
                {:else if entry.type === EntryType.UP}
                  <ArrowUpIcon class="size-3.5 text-foreground/65" aria-label="up" />
                {:else}
                  <TextTIcon class="size-3.5 text-foreground/65" aria-label="text input" />
                {/if}
              </td>
              <td class="max-w-24 truncate px-2 py-1">{key_text(entry.key)}{entry.repeat ? " ↻" : ""}</td>
              <td class="max-w-28 truncate px-2 py-1">{entry.code || "—"}</td>
              <td class="hidden px-2 py-1 @md:table-cell">{entry.type === EntryType.INPUT ? "—" : location_name(entry.location)}</td>
              <td class="hidden px-2 py-1 @lg:table-cell">{entry.modifiers.join("+") || "—"}</td>
              <td class="px-3 py-1 text-right">{entry.held_ms != null ? ms(entry.held_ms) : ""}</td>
            </tr>
          {:else}
            <tr><td colspan="6" class="px-3 py-4 text-center font-sans text-foreground/65">No keys yet</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Section>

  <p class="text-ui text-foreground/65">
    Some combinations never reach a web page: the browser or the system keeps them (Cmd+Q, Cmd+W, Cmd+T and Cmd+Tab on macOS; Ctrl+W,
    Ctrl+T, Alt+Tab and the Windows key on Windows; Fn on most laptops). They don't show up here, and that isn't the keyboard's fault.
  </p>
</div>
