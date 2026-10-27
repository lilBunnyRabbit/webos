export interface ScanInput {
  /** The photo to straighten; without one the sheet asks for a photo first. */
  source?: Blob;
}

declare module "$lib/core/api/services/apps/type" {
  interface AppSheets {
    /** A photographed page, straightened and filtered as the user chose: the image as PNG (B&W) or JPEG. */
    "doc-scan::scan": { input: ScanInput; output: Blob };
  }
}
