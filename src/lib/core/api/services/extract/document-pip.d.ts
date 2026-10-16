// Chrome ships Document Picture-in-Picture, but TypeScript's DOM lib doesn't declare it yet.
interface DocumentPictureInPicture extends EventTarget {
  readonly window: Window | null;
  requestWindow(options?: { width?: number; height?: number; disallowReturnToOpener?: boolean }): Promise<Window>;
}

declare var documentPictureInPicture: DocumentPictureInPicture | undefined;
