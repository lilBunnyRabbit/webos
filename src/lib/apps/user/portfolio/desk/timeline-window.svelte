<script lang="ts">
  import { motion_reduced } from "$lib/core/utils/motion";
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { JOBS } from "../content/experience";
  import { principles_for_job } from "./evidence";
  import { reveal } from "./reveal";
  import type { PortfolioSession } from "./session.svelte";
  import WorkAxis from "./work-axis.svelte";

  let { session, settled, compact }: { session: PortfolioSession; settled: boolean; compact: boolean } = $props();

  const still = motion_reduced();
  const items: Record<string, HTMLElement> = $state({});
  const proven = Object.fromEntries(JOBS.map((job) => [job.id, principles_for_job(job.id)]));

  let flashed = $state<string | null>(null);

  const mark =
    (job: string): Attachment<HTMLElement> =>
    (node) => {
      items[job] = node;
      return () => {
        if (items[job] === node) delete items[job];
      };
    };

  // Its own count only: `pulses` is replaced whole on every pulse, and any window's would re-bring the last job.
  const pulsed = $derived(session.pulses.timeline ?? 0);
  const lit_job = $derived(JOBS.find((job) => proven[job.id].some((principle) => principle.id === session.lit))?.id ?? null);

  $effect(() => {
    const job = session.job;
    void pulsed;
    if (!job || !settled) return;
    const node = untrack(() => items[job]);
    if (node && !session.stacked) reveal(node, "nearest");
    flashed = job;
    const timer = setTimeout(() => (flashed = null), 1600);
    return () => clearTimeout(timer);
  });
</script>

<WorkAxis {session} {compact} {still} lit={lit_job} {flashed} {mark} />
