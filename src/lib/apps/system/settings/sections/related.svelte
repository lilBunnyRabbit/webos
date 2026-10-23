<script lang="ts">
  import kernel, { type AppsService } from "$lib/core/api";
  import { AppIcon, Button, Section, type IconComponent } from "$lib/core/components/ui";
  import { ArrowRight as ArrowRightIcon } from "phosphor-svelte";
  import type { Page } from "../ids";
  import { pages_for, RELATED } from "../pages";

  let { page, onnavigate }: { page: Page; onnavigate: (page: Page) => void } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const PAGES = pages_for(kernel.platform);

  interface Link {
    key: string;
    label: string;
    icon: IconComponent | string;
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
  <Section title="Related" flush class="rounded-none border-t border-hairline pt-5">
    <div class="flex flex-wrap gap-2">
      {#each links as link (link.key)}
        <Button size="sm" variant="secondary" onclick={link.run}>
          {#if typeof link.icon === "string"}<AppIcon src={link.icon} class="size-3.5" />{:else}<link.icon weight="bold" />{/if}
          {link.label}
          {#if !link.external}<ArrowRightIcon class="text-foreground/65" weight="bold" />{/if}
        </Button>
      {/each}
    </div>
  </Section>
{/if}
