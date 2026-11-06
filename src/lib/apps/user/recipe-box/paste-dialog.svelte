<script lang="ts">
  import type { DialogProps } from "$lib/core/api";
  import { Button, Textarea } from "$lib/core/components/ui";
  import type { Attachment } from "svelte/attachments";

  let { resolve }: DialogProps<string> = $props();

  let text = $state("");

  const focus: Attachment<HTMLTextAreaElement> = (element) => element.focus();

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (text.trim() !== "") resolve(text);
  }
</script>

<form class="flex max-h-[calc(100cqh-2rem)] w-[min(34rem,calc(100cqw-2rem))] flex-col gap-4 rounded-2xl bg-background-lighter p-5 shadow-popover" onsubmit={submit}>
  <div>
    <h2 class="text-sm font-semibold">Paste a recipe</h2>
    <p class="mt-0.5 text-ui text-foreground/65">Copy the recipe from a website, title to last step, and paste it here. You can fix anything before it's saved.</p>
  </div>

  <Textarea
    bind:value={text}
    aria-label="Recipe text"
    placeholder={"Banana bread\nServes 8\n\nIngredients\n3 ripe bananas\n1 ½ cups flour\n\nMethod\n1. Mash the bananas…"}
    class="min-h-56 flex-1"
    {@attach focus}
  />

  <div class="flex justify-end gap-2">
    <Button variant="quiet" onclick={() => resolve(null)}>Cancel</Button>
    <Button variant="primary" type="submit" disabled={text.trim() === ""}>Continue</Button>
  </div>
</form>
