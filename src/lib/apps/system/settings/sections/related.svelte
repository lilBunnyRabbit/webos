<script lang="ts">
  import type { Component } from "svelte";
  import type { IconWeight } from "phosphor-svelte";
  import kernel, { type AppsService } from "$lib/core/api";
  import { Button, Section } from "$lib/core/components/ui";
  import { ArrowRight as ArrowRightIcon } from "phosphor-svelte";
  import type { Page } from "../ids";
  import { pages_for, RELATED } from "../pages";

  let { page, onnavigate }: { page: Page; onnavigate: (page: Page) => void } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const PAGES = pages_for(kernel.platform);

  interface Link {
    key: string;
    label: string;
    icon: Component<{ weight?: IconWeight; class?: string }>;
    external: boolean;
    run: () => void;
  }

  const links = $derived(
    (RELATED[page] ?? []).flatMap((link): Link[] => {
      if ("page" in link) {
        const target = PAGES.find((item) => item.value === link.page);
        return target ? [{ key: target.value, label: target.label, icon: target.icon, external: false, run: () => onnavigate(target.value) }] : [];
      }
      const manifest = apps.get(link.app);
      return manifest ? [{ key: link.app, label: link.label, icon: manifest.icon, external: true, run: () => void apps.launch(link.app, link.props) }] : [];
    })
  );
</script>

{#if links.length > 0}
  <Section title="Related" flush class="border-t border-foreground/8 pt-5">
    <div class="flex flex-wrap gap-2">
      {#each links as link (link.key)}
        <Button size="sm" variant="secondary" onclick={link.run}>
          <link.icon weight={link.external ? "duotone" : "bold"} />
          {link.label}
          {#if !link.external}<ArrowRightIcon class="text-foreground/65" weight="bold" />{/if}
        </Button>
      {/each}
    </div>
  </Section>
{/if}
