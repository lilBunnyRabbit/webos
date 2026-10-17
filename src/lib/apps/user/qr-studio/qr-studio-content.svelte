<script lang="ts">
  import { Input, Segmented, Select, Switch, Textarea } from "$lib/core/components/ui";
  import { ContentKind, WifiSecurity, type Content } from "./payload";

  let { content = $bindable() }: { content: Content } = $props();

  const KINDS = [
    { value: ContentKind.URL, label: "Link" },
    { value: ContentKind.TEXT, label: "Text" },
    { value: ContentKind.WIFI, label: "Wi-Fi" },
    { value: ContentKind.VCARD, label: "Contact" },
    { value: ContentKind.EMAIL, label: "Email" },
    { value: ContentKind.PHONE, label: "Phone" },
    { value: ContentKind.UPN, label: "UPN payment" },
  ];

  const SECURITY = [
    { value: WifiSecurity.WPA, label: "WPA" },
    { value: WifiSecurity.WEP, label: "WEP" },
    { value: WifiSecurity.NONE, label: "Open" },
  ];
</script>

{#snippet field(label: string, hint?: string)}
  <span class="flex items-baseline justify-between gap-2 text-ui">
    {label}
    {#if hint}<span class="text-2xs text-foreground/65">{hint}</span>{/if}
  </span>
{/snippet}

<div class="flex flex-col gap-2.5">
  <Select size="sm" aria-label="Content type" options={KINDS} bind:value={content.kind} />

  {#if content.kind === ContentKind.URL}
    <label class="flex flex-col gap-1.5">
      {@render field("Link")}
      <Input size="sm" type="url" inputmode="url" autocapitalize="off" spellcheck={false} placeholder="https://example.com" bind:value={content.url} />
    </label>
  {:else if content.kind === ContentKind.TEXT}
    <label class="flex flex-col gap-1.5">
      {@render field("Text")}
      <Textarea rows={4} placeholder="Anything up to a few kilobytes" bind:value={content.text} />
    </label>
  {:else if content.kind === ContentKind.WIFI}
    <label class="flex flex-col gap-1.5">
      {@render field("Network name")}
      <Input size="sm" autocapitalize="off" spellcheck={false} bind:value={content.wifi.ssid} />
    </label>
    <div class="flex items-center justify-between gap-2 text-ui">
      Security
      <Segmented size="sm" label="Security" options={SECURITY} bind:value={content.wifi.security} />
    </div>
    {#if content.wifi.security !== WifiSecurity.NONE}
      <label class="flex flex-col gap-1.5">
        {@render field("Password")}
        <Input size="sm" autocapitalize="off" autocomplete="off" spellcheck={false} class="font-mono" bind:value={content.wifi.password} />
      </label>
    {/if}
    <label class="flex items-center justify-between gap-2 text-ui">
      Hidden network
      <Switch bind:checked={content.wifi.hidden} />
    </label>
  {:else if content.kind === ContentKind.VCARD}
    <div class="grid grid-cols-2 gap-2">
      <label class="flex flex-col gap-1.5">{@render field("First name")}<Input size="sm" bind:value={content.vcard.first} /></label>
      <label class="flex flex-col gap-1.5">{@render field("Last name")}<Input size="sm" bind:value={content.vcard.last} /></label>
    </div>
    <label class="flex flex-col gap-1.5">{@render field("Phone")}<Input size="sm" type="tel" bind:value={content.vcard.phone} /></label>
    <label class="flex flex-col gap-1.5">{@render field("Email")}<Input size="sm" type="email" bind:value={content.vcard.email} /></label>
    <div class="grid grid-cols-2 gap-2">
      <label class="flex flex-col gap-1.5">{@render field("Company")}<Input size="sm" bind:value={content.vcard.org} /></label>
      <label class="flex flex-col gap-1.5">{@render field("Job title")}<Input size="sm" bind:value={content.vcard.title} /></label>
    </div>
    <label class="flex flex-col gap-1.5">{@render field("Website")}<Input size="sm" type="url" bind:value={content.vcard.url} /></label>
    <label class="flex flex-col gap-1.5">{@render field("Street")}<Input size="sm" bind:value={content.vcard.street} /></label>
    <div class="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
      <label class="flex flex-col gap-1.5">{@render field("Post code")}<Input size="sm" bind:value={content.vcard.zip} /></label>
      <label class="flex flex-col gap-1.5">{@render field("Town")}<Input size="sm" bind:value={content.vcard.city} /></label>
    </div>
    <label class="flex flex-col gap-1.5">{@render field("Country")}<Input size="sm" bind:value={content.vcard.country} /></label>
  {:else if content.kind === ContentKind.EMAIL}
    <label class="flex flex-col gap-1.5">{@render field("To")}<Input size="sm" type="email" bind:value={content.email.to} /></label>
    <label class="flex flex-col gap-1.5">{@render field("Subject")}<Input size="sm" bind:value={content.email.subject} /></label>
    <label class="flex flex-col gap-1.5">{@render field("Message")}<Textarea rows={3} bind:value={content.email.body} /></label>
  {:else if content.kind === ContentKind.PHONE}
    <label class="flex flex-col gap-1.5">
      {@render field("Phone number", "with the country code")}
      <Input size="sm" type="tel" placeholder="+386 1 234 56 78" bind:value={content.phone} />
    </label>
  {:else}
    <p class="text-2xs text-foreground/65">The code a Slovenian banking app scans to fill in a UPN payment slip.</p>
    <label class="flex flex-col gap-1.5">{@render field("Recipient", "33 characters")}<Input size="sm" maxlength={33} bind:value={content.upn.name} /></label>
    <label class="flex flex-col gap-1.5">{@render field("Recipient address")}<Input size="sm" maxlength={33} bind:value={content.upn.street} /></label>
    <label class="flex flex-col gap-1.5">{@render field("Recipient town", "post code and town")}<Input size="sm" maxlength={33} bind:value={content.upn.city} /></label>
    <label class="flex flex-col gap-1.5">{@render field("IBAN")}<Input size="sm" class="font-mono" autocapitalize="characters" spellcheck={false} placeholder="SI56 0000 0000 0000 000" bind:value={content.upn.iban} /></label>
    <div class="grid grid-cols-2 gap-2">
      <label class="flex flex-col gap-1.5">{@render field("Amount", "EUR")}<Input size="sm" inputmode="decimal" class="font-mono" placeholder="0,00" bind:value={content.upn.amount} /></label>
      <label class="flex flex-col gap-1.5">{@render field("Due date")}<Input size="sm" type="date" bind:value={content.upn.due} /></label>
    </div>
    <label class="flex flex-col gap-1.5">{@render field("Reference")}<Input size="sm" class="font-mono" maxlength={26} autocapitalize="characters" spellcheck={false} placeholder="SI00 123-456" bind:value={content.upn.reference} /></label>
    <div class="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
      <label class="flex flex-col gap-1.5">{@render field("Code")}<Input size="sm" class="font-mono" maxlength={4} autocapitalize="characters" bind:value={content.upn.purpose_code} /></label>
      <label class="flex flex-col gap-1.5">{@render field("Purpose", "42 characters")}<Input size="sm" maxlength={42} bind:value={content.upn.purpose} /></label>
    </div>
    <details class="group flex flex-col gap-2">
      <summary class="cursor-pointer py-1 text-ui text-foreground/80">Payer (optional)</summary>
      <div class="flex flex-col gap-2 pt-1">
        <label class="flex flex-col gap-1.5">{@render field("Name")}<Input size="sm" maxlength={33} bind:value={content.upn.payer_name} /></label>
        <label class="flex flex-col gap-1.5">{@render field("Address")}<Input size="sm" maxlength={33} bind:value={content.upn.payer_street} /></label>
        <label class="flex flex-col gap-1.5">{@render field("Town")}<Input size="sm" maxlength={33} bind:value={content.upn.payer_city} /></label>
      </div>
    </details>
  {/if}
</div>
