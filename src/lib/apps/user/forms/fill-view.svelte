<script lang="ts">
  import { Button, Input } from "$lib/core/components/ui";
  import { PaperPlaneTilt as PaperPlaneTiltIcon } from "phosphor-svelte";
  import { blank_answers, questions, type Answer, type Form } from "./form";
  import FormView from "./form-view.svelte";
  import { answer_code, type SharedForm } from "./link";
  import LinkBox from "./link-box.svelte";

  let {
    form,
    shared,
    preview = false,
    respondent = $bindable(""),
  }: { form: Form; shared: SharedForm; preview?: boolean; respondent?: string } = $props();

  let values = $state<Record<string, Answer>>({});
  let wanted = $state(false);
  let link = $state<string | null>(null);

  const complete = $derived({ ...blank_answers(form), ...Object.fromEntries(questions(form).filter((field) => field.key in values).map((field) => [field.key, values[field.key]])) });

  $effect(() => {
    if (!wanted) return;
    const response = { respondent: respondent.trim() || null, submitted_at: Date.now(), answers: complete };
    const source = { ...shared };
    let current = true;
    const timer = setTimeout(async () => {
      const code = await answer_code(source, form, response);
      if (current) link = code;
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  });
</script>

<FormView {form} bind:answers={values}>
  {#snippet footer()}
    {#if preview}
      <p class="text-2xs text-foreground/65 italic">Preview: this is what people see when they open the form's link.</p>
    {:else if questions(form).length > 0}
      <div class="mt-2 flex flex-col gap-3 border-t border-foreground/8 pt-5">
        <label class="flex flex-col gap-1.5">
          <span class="text-ui font-medium">Your name <span class="font-normal text-foreground/65">(optional)</span></span>
          <Input bind:value={respondent} placeholder="Who's answering?" autocomplete="name" />
        </label>
        {#if wanted && link}
          <LinkBox {link} label="Answer code: send it back to whoever shared the form" copy_label="Copy code" long={false} />
        {:else}
          <Button variant="primary" size="lg" class="self-start" disabled={wanted} onclick={() => (wanted = true)}>
            <PaperPlaneTiltIcon weight="bold" /> Create answer code
          </Button>
        {/if}
        <p class="text-2xs text-foreground/65">Nothing is sent anywhere. Your answers go into a code you send back yourself.</p>
      </div>
    {/if}
  {/snippet}
</FormView>
