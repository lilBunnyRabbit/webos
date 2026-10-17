import { SvelteMap } from "svelte/reactivity";
import { modifier_names, type Modifiers } from "./keys";

export const EntryType = { DOWN: "down", UP: "up", INPUT: "input" } as const;
export type EntryType = (typeof EntryType)[keyof typeof EntryType];

export interface KeyEntry {
  id: number;
  type: EntryType;
  key: string;
  code: string;
  location: number;
  modifiers: string[];
  repeat: boolean;
  time: number;
  held_ms: number | null;
}

export interface KeyEventLike extends Modifiers {
  key: string;
  code: string;
  location: number;
  repeat: boolean;
  timeStamp: number;
}

const LOG_SIZE = 80;

interface Held {
  key: string;
  since: number;
}

export class KeyTester {
  readonly presses = new SvelteMap<string, number>();
  readonly held = new SvelteMap<string, Held>();
  last = $state.raw<KeyEntry | null>(null);
  log = $state.raw<KeyEntry[]>([]);
  max_held = $state(0);
  repeats = $state(0);

  private next_id = 0;

  constructor(private readonly mac: boolean) {}

  private push(entry: Omit<KeyEntry, "id">): KeyEntry {
    const full = { ...entry, id: this.next_id++ };
    this.last = full;
    this.log = [full, ...this.log].slice(0, LOG_SIZE);
    return full;
  }

  down(event: KeyEventLike): void {
    const id = event.code || event.key;
    if (event.repeat) this.repeats++;
    else {
      this.presses.set(id, (this.presses.get(id) ?? 0) + 1);
      if (!this.held.has(id)) this.held.set(id, { key: event.key, since: event.timeStamp });
      this.max_held = Math.max(this.max_held, this.held.size);
    }
    this.push(entry(EntryType.DOWN, event, this.mac, null));
  }

  up(event: KeyEventLike): void {
    const id = event.code || event.key;
    const held = this.held.get(id);
    this.held.delete(id);
    this.push(entry(EntryType.UP, event, this.mac, held ? event.timeStamp - held.since : null));
    // macOS sends no keyup for keys released while Cmd is down, so they would stay "held" forever.
    if (this.mac && event.key === "Meta") this.held.clear();
  }

  input(data: string, time: number): void {
    this.push({ type: EntryType.INPUT, key: data, code: "", location: 0, modifiers: [], repeat: false, time, held_ms: null });
  }

  /** Focus left: keyups that happen elsewhere never arrive. */
  release(): void {
    this.held.clear();
  }

  reset(): void {
    this.presses.clear();
    this.held.clear();
    this.last = null;
    this.log = [];
    this.max_held = 0;
    this.repeats = 0;
  }
}

function entry(type: EntryType, event: KeyEventLike, mac: boolean, held_ms: number | null): Omit<KeyEntry, "id"> {
  return {
    type,
    key: event.key,
    code: event.code,
    location: event.location,
    modifiers: modifier_names(event, mac),
    repeat: event.repeat,
    time: event.timeStamp,
    held_ms,
  };
}
