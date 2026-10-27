<script lang="ts">
  import kernel, { ChangeKind, type VersionService } from "$lib/core/api";
  import { Badge } from "$lib/core/components/ui";
  import { format_date } from "$lib/core/utils";

  const version = $derived(kernel.service<VersionService>("version"));
  void kernel.service<VersionService>("version").load_changelog();

  const KINDS = {
    [ChangeKind.NEW]: { label: "New", tone: "primary" },
    [ChangeKind.IMPROVED]: { label: "Improved", tone: "info" },
    [ChangeKind.FIXED]: { label: "Fixed", tone: "success" },
  } as const;

  const unseen = $derived(new Set(version.unseen.map((release) => release.version)));
</script>

<div class="flex flex-col gap-4">
  <p class="text-ui text-foreground/65">Every release of WebOS, newest first. {#if version.info}You're on v{version.info.version}.{/if}</p>

  {#each version.changelog as release (release.version)}
    <article class="flex flex-col gap-3 rounded-xl bg-background-light p-4 ring-1 ring-foreground/8">
      <header class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 class="text-sm font-semibold">{release.title}</h2>
        <Badge class="font-mono">v{release.version}</Badge>
        {#if unseen.has(release.version)}<Badge tone="primary">New to you</Badge>{/if}
        <time class="ml-auto font-mono text-2xs text-foreground/65" datetime={release.date}>{format_date(new Date(`${release.date}T00:00`))}</time>
      </header>
      <ul class="flex flex-col gap-1.5">
        {#each release.changes as change, index (index)}
          <li class="grid grid-cols-[4.5rem_1fr] items-baseline gap-2 text-ui">
            <span><Badge tone={KINDS[change.kind].tone}>{KINDS[change.kind].label}</Badge></span>
            <span>{change.text}</span>
          </li>
        {/each}
      </ul>
    </article>
  {/each}
</div>
