<script lang="ts">
  import kernel, { type DialogsService, type MenuItem, type NotificationsService, type SchedulerService } from "$lib/core/api";
  import { Button, EmptyState, Segmented, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    Eye as EyeIcon,
    EyeSlash as EyeSlashIcon,
    Leaf as LeafIcon,
    PencilSimple as PencilSimpleIcon,
    Plus as PlusIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import BrewCard from "./brew-card.svelte";
  import { attempt, start_brew, steep_again, stop_brew } from "./jobs";
  import {
    all_teas,
    brews_of,
    DATA_FILE,
    delete_tea,
    draft_of,
    EMPTY_TEAS,
    is_built_in,
    save_tea,
    set_hidden,
    strength_of,
    TeaDataSchema,
    TempUnit,
    type Brew,
    type Strength,
    type TeaDraft,
    type TeaEntry,
    type TeaFields,
  } from "./tea";
  import TeaCard from "./tea-card.svelte";
  import TeaEditor from "./tea-editor.svelte";

  const { window: win, storage } = get_app_context();
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const scheduler = $derived(kernel.service<SchedulerService>("scheduler"));

  const file = storage.file(DATA_FILE, EMPTY_TEAS, TeaDataSchema);
  const teas = $derived(file.ready ? all_teas(file.value) : []);
  const brews = $derived(file.ready ? brews_of(scheduler.jobs, file.value, teas) : []);
  const hidden_count = $derived(teas.filter((tea) => tea.hidden).length);

  let show_hidden = $state(false);
  let draft = $state<TeaDraft | null>(null);

  const shown = $derived(teas.filter((tea) => show_hidden || !tea.hidden));
  const brewing = $derived(brews.filter((brew) => !brew.ready).length);
  const ready = $derived(brews.length - brewing);
  const running = $derived(new Map(brews.filter((brew) => !brew.ready).map((brew) => [brew.tea_id, brew])));

  // A cup started a moment ago scrolls into view; one restored at open doesn't.
  const FRESH_MS = 3000;

  // A brew ends between seconds; the countdown only needs the fast clock while one runs.
  const ticker = new Ticker(
    () => win.is_visible,
    () => (brewing > 0 ? 250 : 1000)
  );

  const UNITS = [
    { value: TempUnit.C, label: "°C" },
    { value: TempUnit.F, label: "°F" },
  ];

  function brew(tea: TeaEntry) {
    void notifications.request_system();
    attempt("Couldn't start the brew", start_brew(tea, strength_of(file.value, tea.id)));
  }

  function steep(brew: Brew, steep: number) {
    if (!brew.tea) return;
    void notifications.request_system();
    attempt("Couldn't start the next steep", steep_again(brew, brew.tea, steep));
  }

  function choose_strength(tea: TeaEntry, strength: Strength) {
    file.value.strength[tea.id] = strength;
  }

  function save(fields: TeaFields) {
    if (!draft) return;
    save_tea(file.value, draft.id, fields);
    draft = null;
  }

  async function remove(tea: TeaEntry) {
    if (!(await win.confirm(`Delete “${tea.name}”?`, { confirm_label: "Delete", danger: true }))) return;
    delete_tea(file.value, tea.id);
  }

  async function menu(tea: TeaEntry, anchor: { x: number; y: number }) {
    const items: MenuItem[] = [{ id: "edit", label: "Edit", icon: PencilSimpleIcon }];
    if (tea.edited) items.push({ id: "reset", label: "Reset to default", icon: ArrowCounterClockwiseIcon });
    if (tea.built_in) items.push(tea.hidden ? { id: "show", label: "Show", icon: EyeIcon } : { id: "hide", label: "Hide", icon: EyeSlashIcon });
    else items.push({ separator: true }, { id: "delete", label: "Delete", icon: TrashIcon, danger: true });
    const choice = await dialogs.menu(items, { anchor });
    if (choice === "edit") draft = draft_of(tea, file.value.unit);
    else if (choice === "reset") delete file.value.overrides[tea.id];
    else if (choice === "show" || choice === "hide") set_hidden(file.value, tea.id, choice === "hide");
    else if (choice === "delete") await remove(tea);
  }

  $effect(() =>
    win.on_back(() => {
      if (!draft) return false;
      draft = null;
      return true;
    })
  );
</script>

<div class="@container grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
  {#if file.ready && !draft}
    <Toolbar>
      <Segmented bind:value={file.value.unit} options={UNITS} label="Temperature unit" size="sm" />
      <span class="flex-1"></span>
      {#if hidden_count > 0}
        <Button variant="quiet" size="sm" pressed={show_hidden} onclick={() => (show_hidden = !show_hidden)}>
          {#if show_hidden}<EyeIcon />{:else}<EyeSlashIcon />{/if}<span class="hidden @sm:inline">{hidden_count} hidden</span>
        </Button>
      {/if}
      <Button variant="primary" size="sm" onclick={() => (draft = draft_of(null, file.value.unit))}><PlusIcon weight="bold" />Add tea</Button>
    </Toolbar>
  {:else}
    <div></div>
  {/if}

  <div class="min-h-0">
    {#if !file.ready}
      <div class="grid h-full place-items-center"><Spinner label="Loading" /></div>
    {:else if draft}
      <TeaEditor bind:draft unit={file.value.unit} built_in={draft.id !== null && is_built_in(draft.id)} onsave={save} oncancel={() => (draft = null)} />
    {:else}
      <div class="h-full overflow-auto">
        <div class="mx-auto grid max-w-4xl gap-5 p-2 @md:p-4">
          {#if brews.length > 0}
            <section class="grid gap-2" aria-labelledby="tea-brewing">
              <h2 id="tea-brewing" class="px-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Your cups</h2>
              <ul class="grid gap-2 @xl:grid-cols-2">
                {#each brews as entry (entry.id)}
                  <BrewCard
                    fresh={!entry.ready && entry.end_at - entry.duration_ms > Date.now() - FRESH_MS}
                    brew={entry}
                    now={ticker.now}
                    onsteep={(next) => steep(entry, next)}
                    onstop={() => attempt(entry.ready ? "Couldn't clear the cup" : "Couldn't stop the brew", stop_brew(entry))}
                  />
                {/each}
              </ul>
            </section>
          {/if}
          <section class="grid gap-2" aria-labelledby="tea-teas">
            <h2 id="tea-teas" class="px-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Teas</h2>
            {#if shown.length === 0}
              <EmptyState icon={LeafIcon} title="Every tea is hidden" description="Show the hidden ones, or add your own.">
                {#snippet actions()}
                  <Button onclick={() => (show_hidden = true)}><EyeIcon />Show hidden</Button>
                {/snippet}
              </EmptyState>
            {:else}
              <ul class="grid gap-2 @xl:grid-cols-2 @5xl:grid-cols-3">
                {#each shown as tea (tea.id)}
                  <TeaCard
                    {tea}
                    unit={file.value.unit}
                    strength={strength_of(file.value, tea.id)}
                    onstrength={(next) => choose_strength(tea, next)}
                    brewing={running.get(tea.id)}
                    now={ticker.now}
                    onbrew={() => brew(tea)}
                    onmenu={(anchor) => menu(tea, anchor)}
                  />
                {/each}
              </ul>
            {/if}
          </section>
        </div>
      </div>
    {/if}
  </div>

  <StatusBar>
    <span class="truncate">
      {#if brewing && ready}{brewing} brewing, {ready} ready{:else if brewing}{brewing} brewing{:else if ready}{ready} ready{:else}Nothing brewing{/if}
    </span>
    <span class="ml-auto hidden truncate @md:inline">Rings while WebOS is open, with or without this window</span>
  </StatusBar>
</div>
