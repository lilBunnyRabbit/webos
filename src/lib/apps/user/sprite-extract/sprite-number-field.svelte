<script lang="ts">
  import { Input } from "$lib/core/components/ui";

  interface Props {
    label: string;
    value: number;
    onchange: (value: number) => void;
    min?: number;
    max?: number;
    placeholder?: string;
    title?: string;
    disabled?: boolean;
  }

  let { label, value, onchange, min, max, placeholder, title, disabled }: Props = $props();
</script>

<label class="flex min-w-0 flex-col gap-1" {title}>
  <span class="text-2xs text-foreground/65">{label}</span>
  <Input
    size="sm"
    type="number"
    class="font-mono tabular-nums"
    value={Number.isFinite(value) ? Math.round(value) : ""}
    {min}
    {max}
    {placeholder}
    {disabled}
    onfocus={(event) => event.currentTarget.select()}
    oninput={(event) => {
      const next = event.currentTarget.valueAsNumber;
      if (Number.isFinite(next)) onchange(next);
    }}
  />
</label>
