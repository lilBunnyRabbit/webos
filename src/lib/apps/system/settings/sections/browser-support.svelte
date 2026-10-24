<script lang="ts">
  import { Badge, Button, Section, SettingRow } from "$lib/core/components/ui";
  import { app_name } from "$lib/core/compat/app-names";
  import { browser_label } from "$lib/core/compat/browser";
  import { problems, requirement, Status } from "$lib/core/compat/check";
  import { LEVEL_LABELS, LEVELS } from "$lib/core/compat/features";
  import { compat_now } from "$lib/core/compat/report";
  import { write_dismissed } from "$lib/core/compat/storage";
  import { Warning as WarningIcon } from "phosphor-svelte";

  const STATUS = {
    [Status.OK]: { label: "Supported", tone: "success" },
    [Status.MISSING]: { label: "Missing", tone: "error" },
    [Status.OUTDATED]: { label: "May misbehave", tone: "warning" },
  } as const;

  const { browser, results } = compat_now();
  const wrong = problems(results);
  const missing = wrong.filter((result) => result.status === Status.MISSING).length;
  const outdated = wrong.length - missing;
  const summary =
    wrong.length === 0
      ? `All ${results.length} features supported.`
      : [`${results.length - wrong.length} of ${results.length} supported`, missing && `${missing} missing`, outdated && `${outdated} may misbehave`]
          .filter(Boolean)
          .join(", ") + ".";

  async function show_warning() {
    write_dismissed([]);
    const { show_compat_screen } = await import("$lib/core/compat/screen");
    show_compat_screen({ results, browser, app: null, on_continue: () => {} });
  }
</script>

<Section
  setting="browser-support"
  title="Browser support"
  description="Web features WebOS uses that not every browser has. WebOS checks them at start-up and warns about anything new."
>
  <SettingRow label={browser_label(browser)} description={summary}>
    <Button onclick={show_warning}>
      <WarningIcon /> Show the warning
    </Button>
  </SettingRow>
  {#each LEVELS as level (level)}
    <div class="flex flex-col gap-1 px-4 py-3">
      <h3 class="text-2xs font-semibold text-foreground/65 uppercase">{LEVEL_LABELS[level]}</h3>
      <ul class="flex flex-col">
        {#each results.filter((result) => result.feature.level === level) as { feature, status } (feature.id)}
          <li class="flex flex-col gap-0.5 py-2">
            <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span class="text-ui font-medium">{feature.name}</span>
              <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
            </div>
            <p class="text-2xs text-foreground/80">{feature.lost}</p>
            {#if feature.apps?.length}
              <p class="text-2xs text-foreground/65">Apps: {feature.apps.map(app_name).join(", ")}</p>
            {/if}
            {#if status !== Status.OK}
              <p class="text-2xs text-primary">{requirement(feature, browser)}</p>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</Section>
