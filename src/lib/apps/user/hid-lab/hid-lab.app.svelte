<script lang="ts">
  import { untrack } from "svelte";
  import { z } from "zod";
  import { SideNav } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Keyboard as KeyboardIcon, Usb as UsbIcon } from "phosphor-svelte";
  import HidInspector from "./hid-inspector.svelte";
  import KeyTester from "./key-tester.svelte";

  const SECTIONS = [
    { value: "keys", label: "Key tester", icon: KeyboardIcon },
    { value: "hid", label: "HID devices", icon: UsbIcon },
  ] as const;
  type Section = (typeof SECTIONS)[number]["value"];

  const { section: initial }: { section?: Section } = $props();
  const { storage } = get_app_context();

  const section = storage.window<Section>("section", untrack(() => initial ?? "keys"), z.enum(["keys", "hid"]));

  const current = $derived(SECTIONS.find((entry) => entry.value === section.value) ?? SECTIONS[0]);
</script>

<div class="flex h-full flex-col @2xl:flex-row">
  <SideNav label="Sections" items={[...SECTIONS]} bind:value={section.value} />

  <main class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 @md:px-6">
      <h1 class="text-lg font-semibold">{current.label}</h1>
      {#if section.value === "hid"}
        <HidInspector />
      {:else}
        <KeyTester />
      {/if}
    </div>
  </main>
</div>
