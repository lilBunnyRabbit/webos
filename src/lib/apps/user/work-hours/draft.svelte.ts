/**
 * Text typed into a field whose saved value comes back from disk a moment later. It's shown instead of the saved value
 * until another key (another day) is edited, so a slow round trip never rewinds the text under the cursor.
 */
export class TextDraft {
  private text = $state<string | null>(null);
  private key = $state<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly save: (key: string, text: string) => Promise<void>,
    private readonly delay = 500
  ) {}

  value(key: string, saved: string): string {
    return this.key === key && this.text !== null ? this.text : saved;
  }

  edit(key: string, text: string): void {
    if (this.key !== key) this.flush();
    this.key = key;
    this.text = text;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delay);
  }

  flush(): void {
    clearTimeout(this.timer);
    if (this.key !== null && this.text !== null) void this.save(this.key, this.text);
  }
}
