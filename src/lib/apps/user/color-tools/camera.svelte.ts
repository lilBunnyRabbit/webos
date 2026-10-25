import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";

// Released while `visible()` is false, so a minimized window doesn't keep the camera light on (as `CameraScan` does).
export class Camera {
  stream = $state.raw<MediaStream | null>(null);
  starting = $state(false);
  private wanted = $state(false);
  private destroyed = false;

  constructor(
    private readonly visible: () => boolean,
    private readonly onerror: (reason: unknown) => void
  ) {
    $effect(() => {
      if (!this.wanted) return;
      if (!this.visible()) untrack(() => this.release());
      else if (!this.stream && !this.starting) untrack(() => void this.acquire());
    });
    $effect(() => () => {
      this.destroyed = true;
      this.release();
    });
  }

  get active(): boolean {
    return this.wanted;
  }

  // Call straight from the tap: iOS spends the user activation on the first await.
  start(): Promise<void> {
    this.wanted = true;
    return this.acquire();
  }

  stop(): void {
    this.wanted = false;
    this.release();
  }

  readonly preview: Attachment<HTMLVideoElement> = (element) => {
    const stream = this.stream;
    if (!stream) return;
    element.srcObject = stream;
    element.play().catch((reason) => console.warn("[Color Tools] camera preview failed to play", reason));
    return () => {
      element.srcObject = null;
    };
  };

  private async acquire(): Promise<void> {
    if (this.stream || this.starting) return;
    this.starting = true;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (this.destroyed || !this.wanted || !this.visible()) media.getTracks().forEach((track) => track.stop());
      else this.stream = media;
    } catch (reason) {
      this.wanted = false;
      this.onerror(reason);
    } finally {
      this.starting = false;
    }
  }

  private release(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
