<script lang="ts">
  import { Badge, Section as Group, Segmented, Spinner, Toolbar } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { CheckCircle as CheckCircleIcon, Circle as CircleIcon } from "phosphor-svelte";
  import { killed_bosses, Scope, vault, VaultPeriod, world_bosses } from "./api";
  import type { SectionProps } from "./account.svelte";
  import { boss_name, format_progress, fraction } from "./format";
  import Gate from "./gate.svelte";
  import Problem from "./problem.svelte";
  import StaleNotice from "./stale-notice.svelte";
  import ProgressBar from "./progress-bar.svelte";
  import RefreshButton from "./refresh-button.svelte";
  import { Resource } from "./resource.svelte";
  import { Section } from "./sections";

  let { account, picker, active, onnavigate }: SectionProps = $props();

  const Tab = { ...VaultPeriod, BOSSES: "bosses" } as const;
  type Tab = (typeof Tab)[keyof typeof Tab];
  const TABS = [
    { value: Tab.DAILY, label: "Daily" },
    { value: Tab.WEEKLY, label: "Weekly" },
    { value: Tab.SPECIAL, label: "Special" },
    { value: Tab.BOSSES, label: "Bosses" },
  ];

  let tab = $state<Tab>(Tab.DAILY);

  const periods = {
    [VaultPeriod.DAILY]: new Resource((max_age) => vault(account.key.value, VaultPeriod.DAILY, max_age)),
    [VaultPeriod.WEEKLY]: new Resource((max_age) => vault(account.key.value, VaultPeriod.WEEKLY, max_age)),
    [VaultPeriod.SPECIAL]: new Resource((max_age) => vault(account.key.value, VaultPeriod.SPECIAL, max_age)),
  };
  const bosses = new Resource(async (max_age) => {
    const [all, killed] = await Promise.all([world_bosses(), killed_bosses(account.key.value, max_age)]);
    const done = new Set(killed.data);
    return { data: all.data.map(({ id }) => ({ id, name: boss_name(id), done: done.has(id) })), at: killed.at };
  });

  const current = $derived(tab === Tab.BOSSES ? bosses : periods[tab]);
  const ready = $derived(account.token.data !== null && account.permissions.includes(Scope.PROGRESSION));

  $effect(() => {
    if (active && ready && account.key.value) void current.load();
  });

  const vault_data = $derived(tab === Tab.BOSSES ? null : periods[tab].data);
  const objectives = $derived(
    [...(vault_data?.objectives ?? [])].sort((a, b) => Number(a.claimed) - Number(b.claimed))
  );
  const boss_list = $derived(bosses.data ?? []);
  const boss_count = $derived(boss_list.filter((boss) => boss.done).length);
</script>

<div class="flex h-full flex-col">
  <Toolbar>
    {@render picker()}
    <Segmented size="sm" label="Objectives" options={TABS} bind:value={tab} />
    <span class="flex-1"></span>
    <RefreshButton at={current.at} loading={current.loading} onrefresh={() => void current.load(true)} />
  </Toolbar>

  <div class="min-h-0 flex-1 overflow-auto">
    <Gate {account} scopes={[Scope.PROGRESSION]} onkey={() => onnavigate(Section.KEY)}>
      {#if current.error && !current.data}
        <Problem error={current.error} onretry={() => void current.load(true)} onkey={() => onnavigate(Section.KEY)} />
      {:else if tab !== Tab.BOSSES && vault_data}
        <div class="mx-auto flex max-w-3xl flex-col gap-4 p-4">
          {#if current.error}<StaleNotice error={current.error} />{/if}
          {#if vault_data.meta_progress_complete}
            {@const meta = fraction(vault_data.meta_progress_current ?? 0, vault_data.meta_progress_complete)}
            <div class="flex flex-col gap-2 rounded-xl bg-background-light p-4 ring-1 ring-foreground/8">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <span class="text-sm font-semibold">{tab === Tab.DAILY ? "Daily" : "Weekly"} reward</span>
                <span class="font-mono text-ui tabular-nums">{format_progress(vault_data.meta_progress_current ?? 0, vault_data.meta_progress_complete)}</span>
              </div>
              <ProgressBar value={meta} label="Reward progress" done={meta >= 1} />
              <p class="text-2xs text-foreground/65">
                {vault_data.meta_reward_astral ?? 0} Astral Acclaim{vault_data.meta_reward_claimed ? " · claimed" : ""}
              </p>
            </div>
          {/if}
          {#if objectives.length === 0}
            <p class="px-1 text-ui text-foreground/65">No objectives right now.</p>
          {:else}
            <ul class="flex flex-col divide-y divide-foreground/8 rounded-xl bg-background-light ring-1 ring-foreground/8">
              {#each objectives as objective (objective.id)}
                {@const value = fraction(objective.progress_current, objective.progress_complete)}
                {@const done = value >= 1}
                <li class={cn("flex items-start gap-3 px-4 py-3", objective.claimed && "opacity-70")}>
                  <span class={cn("mt-0.5 shrink-0", done ? "text-success" : "text-foreground/65")}>
                    {#if done}<CheckCircleIcon class="size-4.5" weight="fill" />{:else}<CircleIcon class="size-4.5" />{/if}
                  </span>
                  <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span class="min-w-0 flex-1 text-ui font-medium">{objective.title}</span>
                      <span class="font-mono text-2xs tabular-nums text-foreground/80">{format_progress(objective.progress_current, objective.progress_complete)}</span>
                    </div>
                    <ProgressBar {value} {done} label={objective.title} />
                    <div class="flex flex-wrap items-center gap-1.5">
                      <Badge>{objective.track}</Badge>
                      <Badge tone="primary">{objective.acclaim} AA</Badge>
                      {#if objective.claimed}<Badge tone="success">Claimed</Badge>{/if}
                    </div>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {:else if tab === Tab.BOSSES && bosses.data}
        <div class="mx-auto flex max-w-3xl flex-col gap-4 p-4">
          {#if current.error}<StaleNotice error={current.error} />{/if}
          <Group title="World bosses" description="{boss_count} of {boss_list.length} looted today. Resets at 00:00 UTC.">
            <ul class="grid @lg:grid-cols-2">
              {#each boss_list as boss (boss.id)}
                <li class="flex items-center gap-2.5 px-4 py-2.5">
                  <span class={cn("shrink-0", boss.done ? "text-success" : "text-foreground/65")}>
                    {#if boss.done}<CheckCircleIcon class="size-4" weight="fill" />{:else}<CircleIcon class="size-4" />{/if}
                  </span>
                  <span class={cn("text-ui", boss.done && "text-foreground/65")}>{boss.name}</span>
                </li>
              {/each}
            </ul>
          </Group>
        </div>
      {:else}
        <div class="grid h-full place-items-center"><Spinner /></div>
      {/if}
    </Gate>
  </div>
</div>
