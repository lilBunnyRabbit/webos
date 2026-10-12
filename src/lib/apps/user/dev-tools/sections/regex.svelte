<script lang="ts">
  import { Badge, Input, Section, button } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { MAX_MATCHES, find_matches, segment_text } from "../regex";
  import type { DevToolsState } from "../tools";
  import CopyButton from "./copy-button.svelte";
  import TextArea from "./text-area.svelte";

  let { value = $bindable() }: { value: DevToolsState["regex"] } = $props();

  const FLAGS = [
    { flag: "g", label: "global" },
    { flag: "i", label: "ignore case" },
    { flag: "m", label: "multiline" },
    { flag: "s", label: "dot all" },
    { flag: "u", label: "unicode" },
    { flag: "y", label: "sticky" },
  ];

  const result = $derived(value.pattern === "" ? null : find_matches(value.pattern, value.flags, value.text));
  const matches = $derived(result?.ok ? result.matches : []);
  const segments = $derived(segment_text(value.text, matches));
  const has_groups = $derived(matches.some((match) => match.groups.length > 0));

  function toggle(flag: string) {
    value.flags = value.flags.includes(flag) ? value.flags.replace(flag, "") : value.flags + flag;
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-center gap-1.5 font-mono">
    <span class="text-foreground/65">/</span>
    <Input bind:value={value.pattern} aria-label="Pattern" placeholder="(?<word>\w+)" class="flex-1 font-mono" />
    <span class="text-foreground/65">/</span>
    <Input bind:value={value.flags} aria-label="Flags" class="w-16 font-mono" />
  </div>
  <div class="flex flex-wrap gap-1" role="group" aria-label="Flags">
    {#each FLAGS as { flag, label } (flag)}
      {@const on = value.flags.includes(flag)}
      <button
        type="button"
        aria-pressed={on}
        title={label}
        class={button({
          variant: "quiet",
          size: "sm",
          class: cn("gap-1 px-2 font-normal", on && "bg-primary/15 text-primary hover:bg-primary/15 hover:text-primary active:bg-primary/20"),
        })}
        onclick={() => toggle(flag)}
      >
        <span class="font-mono font-semibold">{flag}</span>{label}
      </button>
    {/each}
  </div>
  {#if result && !result.ok}
    <p role="alert" class="rounded-md bg-error/12 px-3 py-2 text-ui text-error">{result.error}</p>
  {/if}
</div>

<Section title="Test text" flush>
  <TextArea bind:value={value.text} rows={6} aria-label="Test text" placeholder="Text to search" />
</Section>

<Section title="Matches" flush>
  {#snippet actions()}
    {#if result?.ok}
      <Badge tone={matches.length ? "primary" : "neutral"}>
        {result.truncated ? `First ${MAX_MATCHES}` : matches.length}
        {matches.length === 1 ? "match" : "matches"}
      </Badge>
    {/if}
  {/snippet}
  {#if value.text !== ""}
    <pre
      class="max-h-64 overflow-auto rounded-xl bg-background-light p-3 font-mono text-ui leading-relaxed break-words whitespace-pre-wrap ring-1 ring-foreground/8">{#each segments as segment, i (i)}{#if segment.match === null}{segment.text}{:else}<mark
            class={cn("rounded-sm text-foreground", segment.match % 2 ? "bg-primary/35" : "bg-primary/20")}
            title="Match {segment.match + 1}">{segment.text}</mark
          >{/if}{/each}</pre>
  {/if}

  {#if matches.length}
    <div class="max-h-96 overflow-auto rounded-xl bg-background-light ring-1 ring-foreground/8">
      <table class="w-full text-left">
        <thead class="sticky top-0 bg-background-light text-2xs tracking-wide text-foreground/65 uppercase">
          <tr class="border-b border-foreground/8">
            <th class="w-10 px-3 py-1.5 font-medium">#</th>
            <th class="w-16 px-3 py-1.5 text-right font-medium">Index</th>
            <th class="px-3 py-1.5 font-medium">Match</th>
            {#if has_groups}<th class="px-3 py-1.5 font-medium">Groups</th>{/if}
            <th class="w-10"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-foreground/8 font-mono text-2xs">
          {#each matches as match, i (i)}
            <tr>
              <td class="px-3 py-1.5 align-top text-foreground/65 tabular-nums">{i + 1}</td>
              <td class="px-3 py-1.5 text-right align-top text-foreground/65 tabular-nums">{match.index}</td>
              <td class="px-3 py-1.5 align-top break-all">{match.value === "" ? "(empty)" : match.value}</td>
              {#if has_groups}
                <td class="px-3 py-1.5 align-top">
                  <dl class="grid grid-cols-[auto_1fr] gap-x-2">
                    {#each match.groups as group (group.name)}
                      <dt class="text-foreground/65">{group.name}</dt>
                      <dd class="break-all">{group.value ?? "undefined"}</dd>
                    {/each}
                  </dl>
                </td>
              {/if}
              <td class="py-0.5 pr-1 align-top"><CopyButton text={match.value} label="Copy match {i + 1}" /></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if result?.ok && value.text !== ""}
    <p class="text-ui text-foreground/65">No matches.</p>
  {/if}
</Section>
