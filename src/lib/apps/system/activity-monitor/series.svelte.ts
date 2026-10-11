/** A fixed-size ring of samples, newest last. Replaced wholesale on push so `$state.raw` is enough. */
export class Series {
  values = $state.raw<number[]>([]);

  constructor(private readonly size = 60) {}

  get last(): number | null {
    return this.values.at(-1) ?? null;
  }

  get max(): number {
    return this.values.reduce((max, value) => Math.max(max, value), 0);
  }

  push(value: number) {
    this.values = [...this.values.slice(1 - this.size), value];
  }
}
