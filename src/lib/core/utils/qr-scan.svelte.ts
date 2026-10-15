import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { detect_qr, type BarcodeDetector } from "./qr";

export interface CameraScanOptions {
  constraints: MediaTrackConstraints;
  detector: () => Promise<BarcodeDetector>;
  visible: () => boolean;
  oncode: (code: string, video: HTMLVideoElement) => boolean | Promise<boolean>;
  onerror: (reason: unknown) => void;
}

// The camera is released while `visible()` is false, so a minimized window doesn't keep the camera light on.
export class CameraScan {
  stream = $state.raw<MediaStream | null>(null);
  starting = $state(false);
  private wanted = $state(false);
  private destroyed = false;

  constructor(private readonly options: CameraScanOptions) {
    $effect(() => {
      if (!this.wanted) return;
      if (!this.options.visible()) untrack(() => this.release());
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
    element.play().catch((reason) => console.warn("[CameraScan] preview failed to play", reason));

    let active = true;
    let handle = 0;
    const scan = async () => {
      const code = await detect_qr(await this.options.detector(), element).catch(() => null);
      if (!active) return;
      if (code && (await this.options.oncode(code, element))) return this.stop();
      if (active) handle = element.requestVideoFrameCallback(scan);
    };
    handle = element.requestVideoFrameCallback(scan);

    return () => {
      active = false;
      element.cancelVideoFrameCallback(handle);
      element.srcObject = null;
    };
  };

  private async acquire(): Promise<void> {
    if (this.stream || this.starting) return;
    this.starting = true;
    try {
      const camera = navigator.mediaDevices.getUserMedia({ video: this.options.constraints });
      const [media] = await Promise.all([camera, this.options.detector()]);
      if (this.destroyed || !this.wanted || !this.options.visible()) media.getTracks().forEach((track) => track.stop());
      else this.stream = media;
    } catch (reason) {
      this.wanted = false;
      this.options.onerror(reason);
    } finally {
      this.starting = false;
    }
  }

  private release(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
