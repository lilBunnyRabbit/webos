import { flushSync } from "svelte";
import { afterEach, expect, test, vi } from "vitest";
import { accept_offer, create_peer } from "$kit/utils/p2p";
import { NO_PATH, Phase, SendSession } from "./session.svelte";

const cleanup: (() => void)[] = [];

afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

test("the sender stops and explains once ICE fails after the answer is in", { timeout: 60_000 }, async () => {
  const sender = new SendSession();
  cleanup.push(() => sender.close());
  sender.add([new File(["hi"], "a.txt")]);
  void sender.offer();
  await vi.waitFor(() => expect(sender.code).not.toBeNull(), { timeout: 10_000 });

  // A receiver that answers, then vanishes: the sender's checks never get a reply, like a path a carrier NAT blocks.
  const receiver = create_peer();
  const answer = await accept_offer(receiver, sender.code!);
  receiver.close();
  await sender.answer(answer);
  flushSync();

  await vi.waitFor(() => expect(sender.phase, sender.log.map((line) => `${Math.round(line.at)} ${line.text}`).join(" | ")).toBe(Phase.INTERRUPTED), { timeout: 45_000, interval: 500 });
  expect(sender.error).toBe(NO_PATH);
});
