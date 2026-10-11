<script lang="ts">
  import type { DialogProps } from "$lib/core/api";
  import { Warning as WarningIcon, Question as QuestionIcon } from "phosphor-svelte";
  import { cn } from "$lib/core/utils";
  import { Button } from "../ui";

  export interface ConfirmOptions {
    /** A second line under the question: what happens, what can't be undone. */
    detail?: string;
    /** The confirm button's verb, e.g. "Delete". Defaults to "OK". */
    confirm_label?: string;
    /** Destructive action: red confirm button, and Cancel gets the initial focus. */
    danger?: boolean;
  }

  let { message, detail, confirm_label = "OK", danger = false, resolve }: DialogProps<boolean> & ConfirmOptions & { message: string } = $props();
</script>

<div class="grid w-[min(24rem,calc(100vw-2rem))] gap-4 rounded-2xl bg-background-lighter p-5 shadow-popover">
  <div class="flex items-start gap-3">
    <span class={cn("grid size-10 shrink-0 place-items-center rounded-xl", danger ? "bg-error/12 text-error" : "bg-primary/12 text-primary")}>
      {#if danger}<WarningIcon class="size-5" weight="bold" />{:else}<QuestionIcon class="size-5" weight="bold" />{/if}
    </span>
    <div class="min-w-0 pt-0.5">
      <h2 class="text-sm font-semibold break-words">{message}</h2>
      {#if detail}<p class="mt-0.5 text-ui break-words text-foreground/65">{detail}</p>{/if}
    </div>
  </div>

  <div class="flex justify-end gap-2">
    <!-- svelte-ignore a11y_autofocus -->
    <Button variant="quiet" autofocus={danger} onclick={() => resolve(false)}>Cancel</Button>
    <!-- svelte-ignore a11y_autofocus -->
    <Button variant={danger ? "danger" : "primary"} autofocus={!danger} onclick={() => resolve(true)}>{confirm_label}</Button>
  </div>
</div>
