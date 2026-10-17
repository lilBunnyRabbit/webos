<script lang="ts">
  import MarkdownView from "$lib/apps/user/kanban/markdown-view.svelte";
  import { Checkbox, Input, Textarea } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import type { Snippet } from "svelte";
  import { FieldKind, type Answer, type Form } from "./form";
  import InlineText from "./inline-text.svelte";

  let { form, answers = $bindable(), footer }: { form: Form; answers: Record<string, Answer>; footer?: Snippet } = $props();

  const id = $props.id();
</script>

<div class="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
  <h1 class="text-lg font-semibold break-words">{form.title}</h1>

  {#each form.fields as field, index (index)}
    {#if field.kind === FieldKind.NOTE}
      <div class="text-foreground/80"><MarkdownView source={field.content} /></div>
    {:else if field.kind === FieldKind.CHECK}
      <label
        class={cn(
          "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg bg-background-light px-3 py-2.5 ring-1 ring-foreground/8 transition-colors duration-150",
          answers[field.key] === true && "bg-primary/8 ring-primary/40"
        )}
      >
        <Checkbox
          class="mt-0.5 pointer-coarse:size-5"
          checked={answers[field.key] === true}
          onchange={(event) => (answers[field.key] = event.currentTarget.checked)}
        />
        <span class="min-w-0 text-ui leading-relaxed break-words">
          <InlineText text={field.label} />
          {#if field.note}<span class="block text-2xs text-foreground/65"><InlineText text={field.note} /></span>{/if}
        </span>
      </label>
    {:else}
      <div class="flex flex-col gap-1.5">
        <label for="{id}-{index}" class="text-ui font-medium break-words"><InlineText text={field.label} /></label>
        {#if field.kind === FieldKind.AREA}
          <Textarea
            id="{id}-{index}"
            rows={3}
            placeholder={field.placeholder ?? ""}
            value={String(answers[field.key] ?? "")}
            oninput={(event) => (answers[field.key] = event.currentTarget.value)}
          />
        {:else}
          <Input
            id="{id}-{index}"
            placeholder={field.placeholder ?? ""}
            value={String(answers[field.key] ?? "")}
            oninput={(event) => (answers[field.key] = event.currentTarget.value)}
          />
        {/if}
      </div>
    {/if}
  {/each}

  {@render footer?.()}
</div>
