<script lang="ts" module>
  import {
    AppWindow as AppWindowIcon,
    BookOpen as BookOpenIcon,
    GithubLogo as GithubLogoIcon,
    Globe as GlobeIcon,
    Package as PackageIcon,
  } from "phosphor-svelte";
  import type { IconComponent } from "$lib/core/components/ui";
  import { LinkKind } from "../content/types";

  const ICONS: Record<LinkKind, IconComponent> = {
    [LinkKind.WEBOS]: AppWindowIcon,
    [LinkKind.LIVE]: GlobeIcon,
    [LinkKind.SOURCE]: GithubLogoIcon,
    [LinkKind.NPM]: PackageIcon,
    [LinkKind.DOCS]: BookOpenIcon,
    [LinkKind.SITE]: GlobeIcon,
  };
</script>

<script lang="ts">
  import kernel, { Mode, type AppsService } from "$lib/core/api";
  import { button } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import type { Link } from "../content/types";
  import { app_href, link_label } from "../links";

  interface Props {
    links: Link[];
    /** Whose links these are, so a row of icon buttons doesn't read "Source, Source, Source" to a screen reader. */
    name: string;
    /** Every link as an icon, for a row that already says what it is. */
    icons?: boolean;
    class?: string;
  }

  let { links, name, icons = false, class: class_name }: Props = $props();

  // One pattern for every project: the first link written out, then at most two more as icons with a tooltip.
  const ICON_LINKS = 2;

  const apps = $derived(kernel.service<AppsService>("apps"));
  const solo = kernel.mode === Mode.SOLO;

  const shown = $derived(links.filter((link) => link.kind !== LinkKind.WEBOS || apps.get(link.app)));
</script>

{#snippet item(link: Link, wide: boolean)}
  {@const Icon = ICONS[link.kind]}
  {@const label = link_label(link)}
  {@const classes = wide
    ? button({ variant: "secondary", size: "sm", class: "mr-1 pointer-coarse:h-10" })
    : button({ variant: "quiet", size: "sm", icon: true, class: "text-foreground/80 pointer-coarse:size-10" })}
  {#if link.kind === LinkKind.WEBOS && !solo}
    <button class={classes} aria-label={wide ? undefined : `${label}, ${name}`} title={wide ? undefined : label} onclick={() => apps.launch(link.app, link.props)}>
      <Icon weight="bold" />{#if wide}{label}{/if}
    </button>
  {:else}
    <a
      class={classes}
      href={link.kind === LinkKind.WEBOS ? app_href(link.app, link.props) : link.url}
      target="_blank"
      rel={link.kind === LinkKind.WEBOS ? "noopener" : "noopener noreferrer"}
      aria-label={wide ? undefined : `${label}, ${name}`}
      title={wide ? undefined : label}
    >
      <Icon weight="bold" />{#if wide}{label}{/if}
    </a>
  {/if}
{/snippet}

<!-- The icon links travel as one group: when the row is short they wrap together, never one orphaned icon. -->
{#if shown.length > 0}
  <div class={cn("flex flex-wrap items-center gap-0.5", class_name)}>
    {@render item(shown[0], !icons)}
    {#if shown.length > 1}
      <span class="inline-flex flex-nowrap items-center gap-0.5">
        {#each shown.slice(1, 1 + ICON_LINKS) as link (link_label(link) + link.kind)}{@render item(link, false)}{/each}
      </span>
    {/if}
  </div>
{/if}
