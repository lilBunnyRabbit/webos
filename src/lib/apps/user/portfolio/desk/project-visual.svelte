<script lang="ts" module>
  const DESCRIPTIONS: Record<string, string> = {
    webos: "Two windows open from the taskbar on a small desktop, then snap side by side, one to each half.",
    chromatics: "A line of colour script is typed and resolves into a row of five shades of one colour, which then tint a small interface.",
    "task-manager": "Three tasks: the first runs on its own, then two run in parallel, each bar filling to done.",
    petrace: "A phone showing a faint drawing of a house, and beside it a sheet of paper where a pencil traces the same house line by line.",
    "series-tracker": "Two seasons of episodes as a grid, ticked off one by one, with the next episode marked.",
    agtc: "Three coding-agent sessions whose status changes in place: busy, done, waiting for input.",
    "hq-quests": "A list of quests with their status; one is started, and a session clarifies it, investigates, records a decision and writes findings while its status steps to done.",
    "hq-loop": "A quest is started, and each step of the session lights the part of hq it uses: the quest, the lessons, the code style rules, the skills, then the quest again when it's done.",
    "hq-tree": "The folders of the hq repo are stepped through, each showing what it holds and a sample: quests, lessons, code style rules, skills and the CLI.",
    "hq-session": "A session reads a quest brief, matching lessons, code style rules and a skill, works, then writes back findings, a new lesson, a new style rule and its status.",
  };
</script>

<script lang="ts">
  import GraphicAgtc from "./graphic-agtc.svelte";
  import GraphicChromatics from "./graphic-chromatics.svelte";
  import GraphicHqLoop from "./graphic-hq-loop.svelte";
  import GraphicHqQuests from "./graphic-hq-quests.svelte";
  import GraphicHqSession from "./graphic-hq-session.svelte";
  import GraphicHqTree from "./graphic-hq-tree.svelte";
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
  {:else if id === "hq-quests"}
    <GraphicHqQuests {player} />
  {:else if id === "hq-loop"}
    <GraphicHqLoop {player} />
  {:else if id === "hq-tree"}
    <GraphicHqTree {player} />
  {:else if id === "hq-session"}
    <GraphicHqSession {player} />
  {/if}
</div>

<style>
  :global(.hq-scene) {
    grid-template-columns: minmax(0, 1fr);
    padding-inline: 0.875rem;
    font-size: var(--text-xs);
  }

  :global(.hq-flow) {
    gap: 0.625rem;
  }

  :global(.hq-pane) {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    flex-direction: column;
    gap: 0.375rem;
  }

  :global(.hq-caption) {
    color: color-mix(in oklch, var(--foreground) 45%, transparent);
  }

  :global(.hq-wire) {
    position: relative;
    flex: 0 0 1.25rem;
    height: 1px;
    margin-top: 2.1em;
    background: color-mix(in oklch, var(--foreground) 14%, transparent);
  }

  :global(.hq-flow.items-center > .hq-wire) {
    margin-top: 0;
  }

  :global(.hq-wire > span) {
    position: absolute;
    inset: 0;
    background: var(--primary);
    transform-origin: left;
    transition: scale 250ms var(--ease-out);
  }

  @container card (width >= 44rem) {
    :global(.hq-scene) {
      padding-inline: 2.5rem;
      font-size: var(--text-ui);
    }

    :global(.hq-flow) {
      gap: 1.25rem;
    }

    :global(.hq-pane) {
      gap: 0.5rem;
    }

    :global(.hq-wire) {
      flex-basis: 2.5rem;
    }
  }

  @container card (width < 28rem) {
    :global(.hq-wide) {
      display: none;
    }
  }

  @container card (width < 22rem) {
    :global(.hq-scene) {
      padding-inline: 0.75rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.hq-wire > span) {
      transition: none;
    }
  }
</style>
