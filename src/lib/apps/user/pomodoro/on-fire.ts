import type { OnFire } from "$lib/core/api";
import { acquire_timer } from "./timer.svelte";

const on_fire: OnFire = async () => {
  const { timer, release } = acquire_timer();
  try {
    if (!(await timer.loaded())) throw new Error("The timer's files didn't load");
    await timer.settle();
  } finally {
    release();
  }
};

export default on_fire;
