import { PRINCIPLES } from "../content/principles";
import type { Principle } from "../content/types";
import type { PortfolioSession } from "./session.svelte";

export const PEEK_DELAY = 280;

// Unpinning a principle leaves its page up: the page is what was last read. Construct during component init (effect).
// Pointing only previews the logo glyph, after a rest so a sweep morphs nothing; the page turns on click, key, swipe or tour.
export class HowShown {
  private kept = $state<string | null>(null);
  private pending: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly session: PortfolioSession) {
    $effect(() => {
      if (session.lit) this.kept = session.lit;
    });
    $effect(() => () => clearTimeout(this.pending));
  }

  public get id(): string | null {
    return this.session.lit ?? this.kept;
  }

  public get principle(): Principle | null {
    return PRINCIPLES.find((principle) => principle.id === this.id) ?? null;
  }

  public get index(): number {
    const id = this.id;
    return PRINCIPLES.findIndex((principle) => principle.id === id);
  }

  public light(id: string): void {
    // A tapped control keeps focus, and so its peek, after a swipe or arrow turns the page past it.
    clearTimeout(this.pending);
    if (this.session.peek !== id) this.session.peek = null;
    this.session.pause();
    if (this.session.cycling || this.session.lit !== id) this.session.light(id);
  }

  public toggle(id: string): void {
    this.session.pause();
    this.session.light(id);
  }

  public clear(): void {
    this.session.pause();
    this.session.light(null);
    this.kept = null;
  }

  public peek(id: string) {
    const session = this.session;
    const cancel = () => {
      clearTimeout(this.pending);
      if (session.peek === id) session.peek = null;
    };
    return {
      onpointerenter: (event: PointerEvent) => {
        clearTimeout(this.pending);
        if (event.pointerType === "touch") return;
        this.pending = setTimeout(() => (session.peek = id), PEEK_DELAY);
      },
      onpointerleave: cancel,
      onfocus: (event: FocusEvent) => {
        if ((event.currentTarget as HTMLElement | null)?.matches(":focus-visible")) session.peek = id;
      },
      onblur: cancel,
    };
  }
}
