<script lang="ts">
  import { Button, Spinner, Switch } from "$lib/core/components/ui";
  import { error_message } from "$lib/core/utils";
  import { CheckCircle as CheckCircleIcon } from "phosphor-svelte";
  import { SpellStatus, type SpellList } from "./spell-list.svelte";

  interface Props {
    list: SpellList;
    on: boolean;
    onon: (on: boolean) => void;
    onjump: (word: string) => void;
    onignore: (word: string) => void;
    onignoreall: (word: string) => void;
    onadd: (word: string) => void;
    onreplace: (word: string, replacement: string) => void;
  }

  let { list, on, onon, onjump, onignore, onignoreall, onadd, onreplace }: Props = $props();

  const id = $props.id();
  let open = $state<string | null>(null);
  let suggestions = $state.raw<{ word: string; list: string[] | null; error: string } | null>(null);

  const current = $derived(list.words.find((item) => item.word === open) ?? null);

  async function pick(word: string) {
    onjump(word);
    if (open === word) return;
    open = word;
    suggestions = { word, list: null, error: "" };
    try {
      const found = await list.suggest(word);
      if (suggestions?.word === word) suggestions = { word, list: found, error: "" };
    } catch (reason) {
      if (suggestions?.word === word) suggestions = { word, list: [], error: error_message(reason) };
    }
  }

  function act(run: (word: string) => void) {
    if (!current) return;
    run(current.word);
    open = null;
  }
</script>

<label for={id} class="flex min-h-8 cursor-pointer items-center justify-between gap-2 text-ui pointer-coarse:min-h-11">
  <span>Spelling list <span class="block text-2xs text-foreground/65">English (US); loads a dictionary once, about 190 KB</span></span>
  <Switch {id} checked={on} onchange={(event) => onon(event.currentTarget.checked)} />
</label>

{#if on}
  {#if list.status === SpellStatus.LOADING}
    <p class="flex items-center gap-2 text-2xs text-foreground/65"><Spinner label="Loading the dictionary" />Loading the dictionary…</p>
  {:else if list.status === SpellStatus.FAILED}
    <p class="text-2xs text-error">{list.error}</p>
    <Button size="sm" onclick={() => (onon(false), onon(true))}>Try again</Button>
  {:else if list.status === SpellStatus.READY}
    {#if !list.words.length}
      <p class="flex items-center gap-1.5 text-2xs text-foreground/65"><CheckCircleIcon weight="fill" class="size-3.5 text-success" />No misspelt words.</p>
    {:else}
      <div class="flex flex-col" role="list" aria-label="Misspelt words">
        {#each list.words as item (item.word)}
          <div role="listitem" class={["rounded-md", open === item.word && "bg-background-lighter shadow-control"]}>
            <button
              type="button"
              class="flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-ui focus-visible:bg-primary/12 focus-visible:outline-none pointer-coarse:h-11"
              aria-expanded={open === item.word}
              title="Select the next “{item.word}”"
              onclick={() => pick(item.word)}
            >
              <span class="truncate underline decoration-error decoration-wavy underline-offset-4">{item.word}</span>
              <span class="font-mono text-2xs text-foreground/65 tabular-nums">×{item.count}</span>
            </button>
            {#if open === item.word}
              <div class="flex flex-col gap-1.5 px-2 pt-1 pb-2">
                {#if suggestions?.word === item.word && suggestions.list === null}
                  <Spinner label="Finding suggestions" />
                {:else if suggestions?.list?.length}
                  <div class="flex flex-wrap gap-1" aria-label="Suggestions">
                    {#each suggestions.list as suggestion (suggestion)}
                      <Button size="sm" title="Change every “{item.word}” to “{suggestion}”" onclick={() => act((word) => onreplace(word, suggestion))}>{suggestion}</Button>
                    {/each}
                  </div>
                {:else}
                  <p class="text-2xs text-foreground/65">{suggestions?.error || "No suggestions."}</p>
                {/if}
                <div class="grid grid-cols-3 gap-1">
                  <Button size="sm" class="px-1" title="Skip it in this document" onclick={() => act(onignore)}>Ignore</Button>
                  <Button size="sm" class="px-1" title="Skip it in every document" onclick={() => act(onignoreall)}>Ignore all</Button>
                  <Button size="sm" class="px-1" title="Add it to your dictionary, so it's suggested too" onclick={() => act(onadd)}>Add</Button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
{/if}
