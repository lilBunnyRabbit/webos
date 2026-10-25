<script lang="ts" module>
  const DESCRIPTIONS: Record<string, string> = {
    webos: "Two windows open from the taskbar on a small desktop, then snap side by side, one to each half.",
    chromatics: "A line of colour script is typed and resolves into a row of five shades of one colour, which then tint a small interface.",
    "task-manager": "Three tasks: the first runs on its own, then two run in parallel, each bar filling to done.",
    petrace: "A phone showing a faint drawing of a house, and beside it a sheet of paper where a pencil traces the same house line by line.",
    "series-tracker": "Two seasons of episodes as a grid, ticked off one by one, with the next episode marked.",
    agtc: "Three coding-agent sessions whose status changes in place: busy, done, waiting for input.",
    hq: "A quest is picked from a list and started, and each step of the session lights the part of hq it uses: the quest, the knowledge of past fixes, the code style, the skills, then the quest again when it's done.",
  };
</script>

<script lang="ts">
  import GraphicAgtc from "./graphic-agtc.svelte";
  import GraphicChromatics from "./graphic-chromatics.svelte";
  import GraphicHq from "./graphic-hq.svelte";
  import GraphicPetrace from "./graphic-petrace.svelte";
  import GraphicSeasons from "./graphic-seasons.svelte";
  import GraphicTasks from "./graphic-tasks.svelte";
  import GraphicWebos from "./graphic-webos.svelte";
  import type { GraphicPlayer } from "./project-player.svelte";

  let { id, player }: { id: string; player: GraphicPlayer } = $props();
</script>

<p class="sr-only">{DESCRIPTIONS[id]}</p>
<div class="h-full" aria-hidden="true">
  {#if id === "webos"}
    <GraphicWebos {player} />
  {:else if id === "chromatics"}
    <GraphicChromatics {player} />
  {:else if id === "task-manager"}
    <GraphicTasks {player} />
  {:else if id === "petrace"}
    <GraphicPetrace {player} />
  {:else if id === "series-tracker"}
    <GraphicSeasons {player} />
  {:else if id === "agtc"}
    <GraphicAgtc {player} />
  {:else if id === "hq"}
    <GraphicHq {player} />
  {/if}
</div>
