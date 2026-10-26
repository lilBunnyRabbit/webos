<script lang="ts">
  import kernel, { type SettingsService, type SpeechService } from "$lib/core/api";
  import { SPEECH_RATE } from "$lib/core/api/services/settings/persistence";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, Section, Select, SettingRow, Slider } from "$lib/core/components/ui";
  import { SpeakerHigh as SpeakerHighIcon, Stop as StopIcon } from "phosphor-svelte";

  const { window: win } = get_app_context();
  const settings = $derived(kernel.service<SettingsService>("settings"));
  const speech = $derived(kernel.service<SpeechService>("speech"));

  const DEFAULT = "";
  const language = (document.documentElement.lang || navigator.language).split("-")[0].toLowerCase();
  const local = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase().startsWith(language);

  const options = $derived([
    { value: DEFAULT, label: "Browser default" },
    ...[...speech.voices]
      .sort((a, b) => Number(local(b)) - Number(local(a)) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name))
      .map((voice) => ({ value: voice.voiceURI, label: `${voice.name} (${voice.lang})` })),
  ]);
  const missing = $derived(settings.speech.voice !== null && speech.voices.length > 0 && !speech.voices.some((voice) => voice.voiceURI === settings.speech.voice));
  const testing = $derived(speech.speaking === win.id);

  function test() {
    if (testing) speech.stop(win.id);
    else speech.speak(win.id, "This is how WebOS sounds when it reads aloud. Ask can read its answers like this.");
  }
</script>

<div class="flex flex-col gap-8">
  <Section setting="speech-voice" title="Voice" description="Used wherever WebOS reads aloud: Ask's answers and the terminal's say command.">
    {#if !speech.supported}
      <p class="text-ui text-foreground/65">This browser can't read text aloud.</p>
    {:else}
      <SettingRow label="Voice" description={missing ? "The chosen voice isn't on this device, so the browser default is used." : "Voices come from your browser and system; online ones need a connection."}>
        {#snippet children({ id, describedby })}
          <Select
            {id}
            aria-describedby={describedby}
            class="w-full max-w-64"
            options={missing ? [...options, { value: settings.speech.voice ?? DEFAULT, label: "Missing voice" }] : options}
            bind:value={() => settings.speech.voice ?? DEFAULT, (value) => (settings.speech = { ...settings.speech, voice: value || null })}
          />
        {/snippet}
      </SettingRow>
      <SettingRow setting="speech-rate" label="Speed" description="{settings.speech.rate.toFixed(1)}× normal speed.">
        {#snippet children({ id, describedby })}
          <Slider
            {id}
            aria-describedby={describedby}
            aria-valuetext="{settings.speech.rate.toFixed(1)} times"
            class="w-40"
            min={SPEECH_RATE.min}
            max={SPEECH_RATE.max}
            step={0.1}
            bind:value={() => settings.speech.rate, (rate) => (settings.speech = { ...settings.speech, rate: Math.round(rate * 10) / 10 })}
          />
        {/snippet}
      </SettingRow>
      <SettingRow setting="speech-test" label="Try it" description="Reads a sentence with this voice and speed.">
        {#snippet children({ id, describedby })}
          <Button {id} aria-describedby={describedby} onclick={test}>
            {#if testing}<StopIcon weight="fill" />Stop{:else}<SpeakerHighIcon weight="bold" />Test{/if}
          </Button>
        {/snippet}
      </SettingRow>
    {/if}
  </Section>
</div>
