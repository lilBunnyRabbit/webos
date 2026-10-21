// Construct during component init: the timer is an $effect owned by the component.
export class Flash {
  text = $state<string | null>(null);

  constructor(private readonly ms: number) {
    $effect(() => {
      if (!this.text) return;
      const timer = setTimeout(() => (this.text = null), this.ms);
      return () => clearTimeout(timer);
    });
  }

  show(text: string | null): void {
    this.text = text;
  }

  clear(): void {
    this.text = null;
  }
}
