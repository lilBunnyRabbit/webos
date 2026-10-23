<script lang="ts">
  import type { TaskJob } from "$lib/core/api";
  import { button } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    Article as ArticleIcon,
    CheckCircle as CheckCircleIcon,
    CircleNotch as CircleNotchIcon,
    Clock as ClockIcon,
    Pause as PauseIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import type { Component } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { TaskTree, type TreeNode } from "./task-tree.svelte";

  let { job }: { job: TaskJob } = $props();

  // The package's statuses for groups and tasks.
  const STATUS: Record<string, { icon: Component; class: string }> = {
    idle: { icon: ClockIcon, class: "text-foreground/45" },
    "in-progress": { icon: CircleNotchIcon, class: "animate-spin text-primary" },
    success: { icon: CheckCircleIcon, class: "text-success" },
    error: { icon: WarningCircleIcon, class: "text-error" },
    stopped: { icon: PauseIcon, class: "text-warning" },
  };
  const LOG_CLASS = { debug: "text-info", info: "text-foreground/80", warn: "text-warning", error: "text-error" } as const;

  const tree = $derived(job.manager ? new TaskTree(job.manager) : null);
  // A run is usually one root group named like the job: its children are the interesting part.
  const sole = $derived(tree?.nodes.length === 1 && tree.nodes[0].group ? tree.nodes[0] : null);
  const nodes = $derived(sole ? sole.children : (tree?.nodes ?? []));
  const open_logs = new SvelteSet<string>();

  const percent = (progress: number) => `${Math.round(progress * 100)}%`;

  function toggle(id: string) {
    if (open_logs.has(id)) open_logs.delete(id);
    else open_logs.add(id);
  }
</script>

{#snippet row(node: TreeNode)}
  {@const status = STATUS[node.status] ?? STATUS.idle}
  {@const logs_open = open_logs.has(node.id)}
  <li>
    <div class={cn("flex h-7 items-center gap-2 text-2xs", node.status === "idle" && "opacity-55")}>
      <status.icon class={cn("size-3.5 shrink-0", status.class)} weight="bold" />
      <span class={cn("min-w-0 truncate text-ui", node.group && "font-medium")} title={node.name}>{node.name}</span>
      <span class="min-w-0 flex-1 basis-16 truncate text-foreground/55">{node.mode ?? node.note ?? ""}</span>
      {#if node.status === "in-progress" || node.status === "error"}
        <span class="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-field shadow-track">
          <span class={cn("block h-full rounded-full", node.status === "error" ? "bg-error" : "bg-primary")} style:width="{node.progress * 100}%"></span>
        </span>
        <span class="w-8 shrink-0 text-right text-foreground/55 tabular-nums">{percent(node.progress)}</span>
      {/if}
      {#if node.logs.length}
        <button
          class={button({ variant: "quiet", size: "sm", pressed: logs_open, class: cn("h-6 gap-1 px-1.5 text-2xs pointer-coarse:h-8", !logs_open && "text-foreground/55") })}
          aria-label="{logs_open ? 'Hide' : 'Show'} logs of {node.name}"
          aria-expanded={logs_open}
          onclick={() => toggle(node.id)}
        >
          <ArticleIcon class="size-3.5" weight="bold" />
          <span class="tabular-nums">{node.logs.length}</span>
        </button>
      {/if}
    </div>
    {#if logs_open}
      <div class="mb-1.5 ml-5.5 flex max-h-40 flex-col-reverse overflow-auto rounded-md bg-background-darker px-2 py-1.5 font-mono text-2xs">
        <div>
          {#each node.logs as log, index (index)}
            <div class={LOG_CLASS[log.level]}><span class="text-foreground/45">{log.timestamp.slice(11, 19)}</span> {log.message}</div>
          {/each}
        </div>
      </div>
    {/if}
    {#if node.children.length}
      <ul class="ml-1.5 border-l border-hairline pl-3">
        {#each node.children as child (child.id)}
          {@render row(child)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<div class="rounded-lg bg-foreground/4 px-3 py-2">
  {#if tree}
    {#if sole}
      <p class="mb-1 text-2xs text-foreground/55">{sole.mode} · {sole.children.length} {sole.children.length === 1 ? "step" : "steps"}</p>
    {/if}
    <ul aria-label="{job.title} tasks">
      {#each nodes as node (node.id)}
        {@render row(node)}
      {/each}
    </ul>
  {:else}
    <p class="text-2xs text-foreground/55">Starting…</p>
  {/if}
</div>
