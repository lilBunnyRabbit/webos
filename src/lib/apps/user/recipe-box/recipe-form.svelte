<script lang="ts">
  import { Button, IconButton, Input, Textarea } from "$lib/core/components/ui";
  import { ArrowDown as ArrowDownIcon, ArrowUp as ArrowUpIcon, Plus as PlusIcon, Trash as TrashIcon, WarningCircle as WarningCircleIcon, X as XIcon } from "phosphor-svelte";
  import { tick } from "svelte";
  import { empty_ingredient, empty_step, FormIssue, type RecipeForm } from "./recipe-form";

  interface Props {
    form: RecipeForm;
    known_tags: string[];
    issues: FormIssue[];
    onchange: () => void;
    onsource: () => void;
  }

  let { form = $bindable(), known_tags, issues, onchange, onsource }: Props = $props();

  const uid = $props.id();
  let root = $state<HTMLElement | null>(null);
  let tag_draft = $state("");

  const ISSUE_TEXT: Record<FormIssue, string> = {
    [FormIssue.SECTIONS]: "its sections become plain steps",
    [FormIssue.NOTES]: "its notes are dropped",
    [FormIssue.COMMENTS]: "its comments are dropped",
    [FormIssue.REFERENCES]: "links to other recipes become plain ingredients",
    [FormIssue.HEADER]: "header lines it can't read are dropped",
    [FormIssue.MOVED]: "some amounts move to where the ingredient is first mentioned",
  };

  const issue_list = $derived.by(() => {
    const parts = issues.map((issue) => ISSUE_TEXT[issue]);
    return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
  });

  const suggestions = $derived(
    known_tags.filter((tag) => !form.tags.includes(tag) && tag.toLowerCase().includes(tag_draft.trim().toLowerCase()))
  );

  function move<T>(list: T[], index: number, to: number) {
    if (to < 0 || to >= list.length) return;
    const [item] = list.splice(index, 1);
    list.splice(to, 0, item);
    onchange();
  }

  function remove<T>(list: T[], index: number, fresh: () => T) {
    list.splice(index, 1);
    if (list.length === 0) list.push(fresh());
    onchange();
  }

  async function add_ingredient(at = form.ingredients.length) {
    const row = empty_ingredient();
    form.ingredients.splice(at, 0, row);
    await tick();
    root?.querySelector<HTMLInputElement>(`[data-row="${row.id}"]`)?.focus();
  }

  async function add_step() {
    const row = empty_step();
    form.steps.push(row);
    await tick();
    root?.querySelector<HTMLTextAreaElement>(`[data-row="${row.id}"]`)?.focus();
  }

  function add_tag(raw: string) {
    const tag = raw.trim().replace(/^#/, "").replace(/,/g, "");
    tag_draft = "";
    if (tag === "" || form.tags.includes(tag)) return;
    form.tags.push(tag);
    onchange();
  }

  function remove_tag(tag: string) {
    form.tags = form.tags.filter((entry) => entry !== tag);
    onchange();
  }
</script>

<div bind:this={root} class="@container h-full overflow-y-auto">
  <form class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 @lg:p-6" oninput={onchange} onsubmit={(event) => event.preventDefault()}>
    {#if issues.length > 0}
      <div class="flex flex-col gap-2 rounded-lg bg-warning/10 p-3 ring-1 ring-warning/30 @md:flex-row @md:items-center" role="note">
        <p class="flex min-w-0 flex-1 gap-2 text-ui">
          <WarningCircleIcon class="mt-0.5 size-4 shrink-0 text-warning" weight="duotone" />
          <span>This recipe uses things the form can't show. Saving from the form means {issue_list}.</span>
        </p>
        <Button size="sm" onclick={onsource}>Edit the source</Button>
      </div>
    {/if}

    <section class="grid gap-3" aria-label="About">
      <label class="grid gap-1.5 text-ui text-foreground/80">
        Title
        <Input size="lg" bind:value={form.title} placeholder="Recipe name" autocomplete="off" />
      </label>
      <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
        <label class="grid gap-1.5 text-ui text-foreground/80">
          Servings
          <Input bind:value={form.servings} inputmode="numeric" autocomplete="off" />
        </label>
        <label class="grid gap-1.5 text-ui text-foreground/80">
          Link to the recipe
          <Input bind:value={form.source} type="url" inputmode="url" placeholder="https://…" autocomplete="off" spellcheck="false" />
        </label>
      </div>
      <div class="grid gap-1.5">
        <label for={`${uid}-tag`} class="text-ui text-foreground/80">Tags</label>
        {#if form.tags.length > 0}
          <ul class="flex flex-wrap gap-1" aria-label="Tags on this recipe">
            {#each form.tags as tag (tag)}
              <li>
                <Button size="sm" variant="secondary" pressed onclick={() => remove_tag(tag)} aria-label={`Remove tag ${tag}`}>{tag}<XIcon /></Button>
              </li>
            {/each}
          </ul>
        {/if}
        <div class="flex gap-2">
          <Input
            id={`${uid}-tag`}
            class="min-w-0 flex-1"
            bind:value={tag_draft}
            placeholder="Add a tag, like dinner"
            autocomplete="off"
            oninput={(event) => event.stopPropagation()}
            onkeydown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              add_tag(tag_draft);
            }}
          />
          <Button onclick={() => add_tag(tag_draft)} disabled={tag_draft.trim() === ""}>Add</Button>
        </div>
        {#if suggestions.length > 0}
          <div class="flex flex-wrap gap-1" role="group" aria-label="Your tags">
            {#each suggestions as tag (tag)}
              <Button size="sm" variant="quiet" onclick={() => add_tag(tag)}><PlusIcon />{tag}</Button>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <section class="grid gap-2" aria-labelledby={`${uid}-ingredients`}>
      <h2 id={`${uid}-ingredients`} class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Ingredients</h2>
      <ol class="grid gap-2">
        {#each form.ingredients as row, index (row.id)}
          <li class="grid grid-cols-[4.5rem_5.5rem_minmax(0,1fr)] gap-1.5 border-b border-foreground/6 pb-2 last:border-0 @lg:grid-cols-[5rem_6rem_minmax(0,1fr)_auto] @lg:border-0 @lg:pb-0">
            <Input
              data-row={row.id}
              bind:value={row.amount}
              aria-label={`Amount, ingredient ${index + 1}`}
              placeholder="Amount"
              inputmode="decimal"
              autocomplete="off"
              onkeydown={(event) => event.key === "Enter" && (event.preventDefault(), void add_ingredient(index + 1))}
            />
            <Input
              bind:value={row.unit}
              aria-label={`Unit, ingredient ${index + 1}`}
              placeholder="Unit"
              autocomplete="off"
              onkeydown={(event) => event.key === "Enter" && (event.preventDefault(), void add_ingredient(index + 1))}
            />
            <Input
              bind:value={row.name}
              aria-label={`Ingredient ${index + 1}`}
              placeholder="Ingredient"
              autocomplete="off"
              onkeydown={(event) => event.key === "Enter" && (event.preventDefault(), void add_ingredient(index + 1))}
            />
            <div class="col-span-3 flex justify-end gap-0.5 @lg:col-span-1">
              <IconButton label="Move up" disabled={index === 0} onclick={() => move(form.ingredients, index, index - 1)}><ArrowUpIcon /></IconButton>
              <IconButton label="Move down" disabled={index === form.ingredients.length - 1} onclick={() => move(form.ingredients, index, index + 1)}><ArrowDownIcon /></IconButton>
              <IconButton label="Remove ingredient" onclick={() => remove(form.ingredients, index, empty_ingredient)}><TrashIcon /></IconButton>
            </div>
          </li>
        {/each}
      </ol>
      <p class="text-2xs text-foreground/65">Write notes after a comma, like "butter, softened". Ingredients the steps mention get their amount there.</p>
      <Button class="justify-self-start" onclick={() => add_ingredient()}><PlusIcon />Add ingredient</Button>
    </section>

    <section class="grid gap-2" aria-labelledby={`${uid}-steps`}>
      <h2 id={`${uid}-steps`} class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Steps</h2>
      <ol class="grid gap-3">
        {#each form.steps as step, index (step.id)}
          <li class="grid gap-1.5">
            <div class="flex items-center gap-2">
              <span class="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/8 font-mono text-2xs tabular-nums" aria-hidden="true">{index + 1}</span>
              <span class="flex-1 text-ui text-foreground/80">Step {index + 1}</span>
              <IconButton label="Move up" disabled={index === 0} onclick={() => move(form.steps, index, index - 1)}><ArrowUpIcon /></IconButton>
              <IconButton label="Move down" disabled={index === form.steps.length - 1} onclick={() => move(form.steps, index, index + 1)}><ArrowDownIcon /></IconButton>
              <IconButton label="Remove step" onclick={() => remove(form.steps, index, empty_step)}><TrashIcon /></IconButton>
            </div>
            <Textarea data-row={step.id} bind:value={step.text} aria-label={`Step ${index + 1}`} placeholder="What to do in this step" class="min-h-20" />
          </li>
        {/each}
      </ol>
      <Button class="justify-self-start" onclick={add_step}><PlusIcon />Add step</Button>
    </section>
  </form>
</div>
