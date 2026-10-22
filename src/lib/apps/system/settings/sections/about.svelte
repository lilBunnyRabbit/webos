<script lang="ts">
  import kernel, {
    author_link,
    credits,
    OWNER,
    type AppsService,
    type VersionService,
  } from "$lib/core/api";
  import LogoLockup from "$lib/core/components/brand/logo-lockup.svelte";
  import { AppIcon, Badge, Button, Section, SettingRow } from "$lib/core/components/ui";
  import { format_datetime } from "$lib/core/utils";
  import { installer } from "$lib/core/utils/install.svelte";
  import { FeedbackKind, issue_url, REPOSITORY } from "../feedback";
  import BrowserSupport from "./browser-support.svelte";
  import Pipeline from "./pipeline.svelte";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowSquareOut as ArrowSquareOutIcon,
    Bug as BugIcon,
    CheckCircle as CheckCircleIcon,
    Compass as CompassIcon,
    DownloadSimple as DownloadSimpleIcon,
    GithubLogo as GithubLogoIcon,
    Lightbulb as LightbulbIcon,
    Link as LinkIcon,
    Play as PlayIcon,
    RocketLaunch as RocketLaunchIcon,
    Sparkle as SparkleIcon,
  } from "phosphor-svelte";

  const version = $derived(kernel.service<VersionService>("version"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const CREDIT_PREVIEW = 12;
  const credit_list = $derived(credits(apps.listings()));
  let expanded = $state<string[]>([]);

  const DEV = import.meta.env.DEV;
  const INSTALL_WHY = "Its own window, works offline, and the browser is far less likely to clear its storage.";

  const rows = $derived([
    ["Version", version.info.version],
    ["Commit", version.info.commit],
    ["Branch", version.info.branch],
    ["Built", format_datetime(new Date(version.info.buildTime))],
  ]);

  function open_issue(kind: FeedbackKind) {
    window.open(issue_url(kind, version.info, kernel.platform), "_blank", "noopener,noreferrer");
  }

</script>

<div class="flex flex-col gap-8">
  <div class="flex flex-col items-start gap-3 rounded-xl bg-background-light p-5 ring-1 ring-foreground/8">
    <LogoLockup height={40} />
    <div>
      <h2 class="text-base font-semibold">WebOS</h2>
      <p class="text-ui text-foreground/65">A desktop that lives in your browser. Runs offline, keeps your files on this device.</p>
    </div>
    <div class="flex gap-1.5">
      <Badge tone={DEV ? "warning" : "primary"}>{DEV ? "Development" : "Production"}</Badge>
      <Badge>v{version.info.version}</Badge>
    </div>
  </div>

  <Section setting="install" title="Install">
    <SettingRow
      label="Install WebOS"
      description={installer.installed || installer.can_install ? INSTALL_WHY : `${INSTALL_WHY} ${installer.hint}`}
    >
      {#if installer.installed}
        <span class="flex items-center gap-1.5 text-ui font-medium text-success">
          <CheckCircleIcon class="size-4" weight="fill" /> Installed
        </span>
      {:else if installer.can_install}
        <Button variant="primary" onclick={() => installer.install()}>
          <DownloadSimpleIcon /> Install
        </Button>
      {/if}
    </SettingRow>
  </Section>

  <Section setting="build" title="Build">
    {#each rows as [label, value] (label)}
      <SettingRow {label}>
        {#snippet children({ id })}<output {id} class="truncate font-mono text-2xs">{value}</output>{/snippet}
      </SettingRow>
    {/each}
  </Section>

  <Section setting="updates" title="Updates" description={DEV ? "Update checks are off in development builds." : "WebOS also checks every 30 minutes on its own."}>
    <SettingRow
      label={version.update_available ? `v${version.update_available.version} is ready` : "You're on the latest build"}
      description={version.update_available ? `Commit ${version.update_available.commit}. Reloads into the new build.` : undefined}
    >
      {#if version.update_available}
        <Button variant="primary" onclick={() => version.apply_update()}>
          <SparkleIcon weight="fill" /> Update and reload
        </Button>
      {:else}
        {#if !version.is_checking && !DEV}<CheckCircleIcon class="size-4 text-success" weight="fill" />{/if}
        <Button disabled={DEV || version.is_checking} onclick={() => version.check()}>
          <ArrowClockwiseIcon class={version.is_checking ? "animate-spin" : ""} />
          {version.is_checking ? "Checking" : "Check now"}
        </Button>
      {/if}
    </SettingRow>
  </Section>

  <Pipeline />

  <BrowserSupport />

  <Section setting="introduction" title="Introduction">
    <SettingRow label="Show the introduction" description="The full-screen tour from your first visit: installing, files, getting around, theme and taskbar.">
      <Button onclick={() => version.show_intro()}>
        <PlayIcon /> Show again
      </Button>
    </SettingRow>
    <SettingRow label="Getting started" description="A card for each part of WebOS, from the command palette to backups, with a Try it button.">
      <Button onclick={() => apps.launch("getting-started")}>
        <CompassIcon /> Open
      </Button>
    </SettingRow>
  </Section>

  <Section setting="feedback" title="Feedback" description="Opens a pre-filled issue on GitHub; posting it needs a GitHub account.">
    <SettingRow label="Request a feature" description="An idea for WebOS or one of its apps.">
      <Button onclick={() => open_issue(FeedbackKind.FEATURE)}>
        <LightbulbIcon /> Request <ArrowSquareOutIcon class="size-3.5" />
      </Button>
    </SettingRow>
    <SettingRow label="Propose an app" description="A fuller pitch for a new app, with room for sketches and screenshots.">
      <Button onclick={() => open_issue(FeedbackKind.PROPOSAL)}>
        <RocketLaunchIcon /> Propose <ArrowSquareOutIcon class="size-3.5" />
      </Button>
    </SettingRow>
    <SettingRow label="Report a bug" description="Something that doesn't work. Your version and platform are filled in.">
      <Button onclick={() => open_issue(FeedbackKind.BUG)}>
        <BugIcon /> Report <ArrowSquareOutIcon class="size-3.5" />
      </Button>
    </SettingRow>
  </Section>

  <Section setting="credits" title="Credits" description="Who made the apps in WebOS. An app without a credit of its own is the owner's.">
    {#each credit_list as { author, apps: made } (author.name)}
      {@const href = author_link(author)}
      {@const open = expanded.includes(author.name)}
      {@const shown = open ? made : made.slice(0, CREDIT_PREVIEW)}
      <div class="flex flex-col gap-2.5 px-4 py-3">
        <div class="flex items-center gap-3">
          <span aria-hidden="true" class="grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
            {author.name.slice(0, 1).toUpperCase()}
          </span>
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 text-ui font-semibold">
              <span class="truncate">{author.name}</span>
              {#if author.github?.toLowerCase() === OWNER.github?.toLowerCase()}<Badge>Owner</Badge>{/if}
            </p>
            <p class="text-2xs text-foreground/65">{made.length} {made.length === 1 ? "app" : "apps"}</p>
          </div>
          {#if href}
            <a
              {href}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-ui text-foreground/80 hover:bg-foreground/8 hover:text-foreground"
            >
              {#if author.github}<GithubLogoIcon class="size-4" weight="duotone" /> <span class="font-mono text-2xs">{author.github}</span>
              {:else}<LinkIcon class="size-4" /> Website{/if}
            </a>
          {/if}
        </div>
        <ul class="flex flex-wrap gap-1 pl-12">
          {#each shown as manifest (manifest.id)}
            <li class="flex h-6 items-center gap-1.5 rounded-md bg-foreground/6 px-2 text-2xs text-foreground/80">
              <AppIcon src={manifest.icon} class="size-3.5 text-foreground/65" />
              {manifest.name}
            </li>
          {/each}
          {#if made.length > CREDIT_PREVIEW}
            <li>
              <Button
                size="sm"
                variant="quiet"
                class="h-6 px-2 text-2xs"
                onclick={() => (expanded = open ? expanded.filter((name) => name !== author.name) : [...expanded, author.name])}
              >
                {open ? "Show fewer" : `+${made.length - CREDIT_PREVIEW} more`}
              </Button>
            </li>
          {/if}
        </ul>
      </div>
    {/each}
  </Section>

  <a
    href={REPOSITORY}
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex items-center gap-1.5 self-start text-ui text-primary hover:underline"
  >
    Source on GitHub <ArrowSquareOutIcon class="size-3.5" />
  </a>
</div>
