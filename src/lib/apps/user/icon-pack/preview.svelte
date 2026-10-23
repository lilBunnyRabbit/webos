<script lang="ts">
  import { BRAND_DARK, BRAND_LIGHT } from "$lib/core/api/services/settings/themes";
  import type { Theme } from "$lib/core/api/services/settings/type";
  import { paint } from "$kit/utils/image";
  import { CARD_HEIGHT, CARD_WIDTH, PackFile, SAFE_ZONE, type IconOptions } from "./pack";
  import type { RenderedIcons } from "./render";

  interface Props {
    icons: RenderedIcons;
    card: OffscreenCanvas | null;
    options: IconOptions;
    title: string;
  }

  const { icons, card, options, title }: Props = $props();

  // The brand's own light and dark palettes stand in for the platforms' chrome, whatever theme WebOS is in.
  const SCHEMES: { label: string; theme: Theme }[] = [
    { label: "Light", theme: BRAND_LIGHT },
    { label: "Dark", theme: BRAND_DARK },
  ];

  const ANDROID_MASKS = [
    { label: "Circle", class: "rounded-full" },
    { label: "Squircle", class: "rounded-full [corner-shape:squircle]" },
    { label: "Rounded", class: "" },
  ];

  const INSTALL_SIZES = [
    { size: 48, label: "48 · shortcut", source: "icon_192" },
    { size: 96, label: "96 · launcher", source: "icon_192" },
    { size: 128, label: "512 · splash", source: "icon_512" },
  ] as const;

  const mock_style = (theme: Theme) =>
    `--mock-wall: ${theme.background_darkest}; --mock-surface: ${theme.background}; --mock-ink: ${theme.foreground}`;

  const safe_inset = `${((1 - SAFE_ZONE) / 2) * 100}%`;
</script>

{#snippet heading(label: string, detail = "")}
  <div class="flex items-baseline justify-between gap-2 px-0.5">
    <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{label}</h3>
    {#if detail}<span class="truncate font-mono text-2xs text-foreground/65">{detail}</span>{/if}
  </div>
{/snippet}

{#snippet image(source: OffscreenCanvas, size: number, extra: string = "", radius: string | undefined = undefined)}
  <canvas {@attach paint(source)} class={["block shrink-0", extra]} style:width="{size}px" style:height="{size}px" style:border-radius={radius}></canvas>
{/snippet}

{#snippet safe_zone()}
  {#if options.safe_zone}
    <span class="safe pointer-events-none absolute rounded-full" style:inset={safe_inset}></span>
  {/if}
{/snippet}


<div class="flex flex-col gap-6">
  <section class="flex flex-col gap-2">
    {@render heading("Browser tab", `${PackFile.ICO} · 16, 32, 48`)}
    <div class="grid gap-3 @lg:grid-cols-2">
      {#each SCHEMES as scheme (scheme.label)}
        <div class="flex min-w-0 flex-col overflow-hidden rounded-lg bg-(--mock-wall)" style={mock_style(scheme.theme)} role="group" aria-label="{scheme.label}">
          <div class="flex items-end gap-1 px-2 pt-2">
            <div class="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-t-lg bg-(--mock-surface) px-3" title="16 px, pixel for pixel">
              {@render image(icons.favicons[0], 16, "[image-rendering:pixelated]")}
              <span class="min-w-0 truncate text-xs text-(--mock-ink)">{title}</span>
            </div>
            <div class="flex h-9 min-w-0 flex-1 items-center gap-2 px-3" title="32 px, as a retina screen shows it">
              {@render image(icons.favicons[1], 16)}
              <span class="min-w-0 truncate text-xs text-(--mock-ink) opacity-70">{title}</span>
            </div>
          </div>
          <div class="h-4 bg-(--mock-surface)"></div>
        </div>
      {/each}
    </div>
    <p class="px-0.5 text-2xs text-foreground/65">The active tab shows the 16 px icon pixel for pixel; the other is the 32 px one a retina screen uses.</p>
  </section>

  <section class="flex flex-col gap-2">
    {@render heading("Home screen", `${PackFile.APPLE} · ${PackFile.MASKABLE}`)}
    <div class="grid gap-3 @lg:grid-cols-2">
      {#each SCHEMES as scheme (scheme.label)}
        <div class="flex min-w-0 flex-col overflow-hidden rounded-lg bg-(--mock-wall)" style={mock_style(scheme.theme)} role="group" aria-label="{scheme.label}">
          <div class="flex flex-wrap items-start justify-center gap-x-5 gap-y-4 bg-(--mock-wall) px-4 py-5">
            <figure class="flex w-16 flex-col items-center gap-1.5">
              {@render image(icons.apple, 60, "", "22.37%")}
              <figcaption class="w-full truncate text-center text-2xs text-(--mock-ink)">iOS</figcaption>
            </figure>
            {#each ANDROID_MASKS as mask (mask.label)}
              <figure class="flex w-16 flex-col items-center gap-1.5">
                <span class={["relative block overflow-hidden", mask.class]} style:border-radius={mask.class ? undefined : `${options.radius}%`}>
                  {@render image(icons.maskable, 60)}
                  {@render safe_zone()}
                </span>
                <figcaption class="w-full truncate text-center text-2xs text-(--mock-ink)">{mask.label}</figcaption>
              </figure>
            {/each}
            <figure class="flex w-16 flex-col items-center gap-1.5" title="The whole maskable icon: Android may crop anything outside the safe zone">
              <span class="relative block">
                {@render image(icons.maskable, 60)}
                {@render safe_zone()}
              </span>
              <figcaption class="w-full truncate text-center text-2xs text-(--mock-ink)">Uncropped</figcaption>
            </figure>
          </div>
        </div>
      {/each}
    </div>
    <p class="px-0.5 text-2xs text-foreground/65">Android crops the maskable icon to its launcher's shape. Keep what matters inside the dashed safe zone.</p>
  </section>

  <section class="flex flex-col gap-2">
    {@render heading("Installed app", `${PackFile.ICON_192} · ${PackFile.ICON_512}`)}
    <div class="grid gap-3 @lg:grid-cols-2">
      {#each SCHEMES as scheme (scheme.label)}
        <div class="flex min-w-0 flex-col overflow-hidden rounded-lg bg-(--mock-wall)" style={mock_style(scheme.theme)} role="group" aria-label="{scheme.label}">
          <div class="flex flex-wrap items-end justify-center gap-5 bg-(--mock-surface) px-4 py-5">
            {#each INSTALL_SIZES as item (item.label)}
              <figure class="flex flex-col items-center gap-1.5">
                {@render image(icons[item.source], item.size, "", `${options.radius}%`)}
                <figcaption class="font-mono text-2xs text-(--mock-ink) tabular-nums">{item.label}</figcaption>
              </figure>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    <p class="px-0.5 text-2xs text-foreground/65">Corners are a preview only: the PNGs stay square, and each platform rounds them its own way.</p>
  </section>

  <section class="flex flex-col gap-2">
    {@render heading("Social card", `${PackFile.CARD} · ${CARD_WIDTH} × ${CARD_HEIGHT}`)}
    {#if card}
      <canvas {@attach paint(card)} class="block h-auto w-full max-w-3xl rounded-lg ring-1 ring-hairline" style:aspect-ratio="{CARD_WIDTH} / {CARD_HEIGHT}"></canvas>
    {:else}
      <div class="max-w-3xl rounded-lg bg-foreground/6" style:aspect-ratio="{CARD_WIDTH} / {CARD_HEIGHT}"></div>
    {/if}
  </section>
</div>

<style>
  .safe {
    outline: 1.5px dashed var(--cottontail);
    outline-offset: -0.75px;
    box-shadow: 0 0 0 1.5px var(--background-darkest);
  }
</style>
