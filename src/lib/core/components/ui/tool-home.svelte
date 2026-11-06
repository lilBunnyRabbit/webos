<script lang="ts" generics="T extends string">
  import { cn } from "$lib/core/utils";
  import type { IconComponent } from "./types";

  interface Tool {
    value: T;
    label: string;
    icon: IconComponent;
    description: string;
    takes?: string;
    /** Tools sharing a group sit under its overline. Keep a group's tools together. */
    group?: string;
  }

  interface Props {
    title: string;
    description?: string;
    tools: Tool[];
    onpick: (value: T) => void;
    class?: string;
  }

  let { title, description, tools, onpick, class: class_name }: Props = $props();

  const groups = $derived.by(() => {
    const list: { name: string | undefined; tools: Tool[] }[] = [];
    for (const tool of tools) {
      const last = list.at(-1);
      if (last && last.name === tool.group) last.tools.push(tool);
      else list.push({ name: tool.group, tools: [tool] });
    }
    return list;
  });
</script>

<div class={cn("h-full min-h-0 overflow-y-auto", class_name)}>
  <div class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-5 @md:px-6 @md:py-6">
    <header class="flex flex-col gap-1">
      <h1 class="text-lg font-semibold">{title}</h1>
      {#if description}<p class="max-w-prose text-ui text-pretty text-foreground/80">{description}</p>{/if}
    </header>

    {#each groups as group, index (group.name ?? index)}
      <section class="flex flex-col gap-2" aria-label={group.name}>
        {#if group.name}<h2 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{group.name}</h2>{/if}
        <ul class="grid grid-cols-1 gap-2 @lg:grid-cols-2">
          {#each group.tools as tool (tool.value)}
            <li class="flex">
              <button
                type="button"
                class="group/tool flex w-full items-start gap-3 rounded-xl bg-background-light p-3 text-start ring-1 ring-foreground/8 transition-colors duration-150 hover:bg-background-lighter active:opacity-70 focus-visible:outline-2 focus-visible:outline-cottontail"
                onclick={() => onpick(tool.value)}
              >
                <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                  <tool.icon class="size-5" weight="duotone" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span class="flex items-baseline justify-between gap-2">
                    <span class="truncate text-ui font-medium">{tool.label}</span>
                    {#if tool.takes}<span class="shrink-0 font-mono text-2xs text-foreground/65">{tool.takes}</span>{/if}
                  </span>
                  <span class="text-ui text-pretty text-foreground/80">{tool.description}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
</div>
