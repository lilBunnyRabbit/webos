# ADR-080: Doc Scan
**Date:** 2026-10-27
**Status:** Implemented

## Context
Photographing a page is how most people "scan" today, and the photo comes out skewed, shadowed and framed by the table. Font Maker already straightens a photographed template with a hand-written homography, and PDF Tools already writes PDFs. The owner wants a scanner app, phone first, that other apps can borrow ([brainstorm](../brainstorm/2026-10-27_doc-scan-and-app-sheets.md)).

## Decision
1. **App `doc-scan`**, standalone, phone first. `tools: ["image/*"]` (Open with on pictures; `.pdf` is not claimed). Props `photo?: boolean` (start the picker at once) and `paths?: string[]`.
2. **Capture without a viewfinder:** the file picker (`pick_device_files({ accept: ["image/*"] })`, the camera on a phone), drop and paste on desktop (ADR-076), and WebOS files through the picker.
3. **Per page:** paper corners found automatically (`find_paper` in `$kit/utils/perspective`: Otsu threshold, the biggest bright region, corners from the extremes of x + y and x − y, a default quad when nothing stands out), fixed by dragging with the kit's `QuadFrame`; filter Color, Gray or B&W (the adaptive threshold); reorder with buttons; delete.
4. **Warp** capped at about 2000–2500 px on the long side, in a worker when the main thread would stall.
5. **Export** one PDF through PDF Tools' `PdfWriter` as a task: B&W pages as PNG, the rest as JPEG; `pick_save` defaulting to `/home/Documents/Scan YYYY-MM-DD HH.MM.pdf`. No project file, no session restore of pages.
6. **Sheet** `provides: { scan }` (ADR-079): input `{ source?: Blob }` (without a source the sheet asks for a photo), output the straightened image `Blob` with the chosen filter, or `null`.
7. **Shell:** props and the Open with entry only.

## Alternatives Considered
- **A live camera viewfinder with edge tracking.** More code, worse on desktop, and the OS camera app already takes a better photo.
- **A project file** to come back to: a scan is a one-off; the PDF is the document.
- **Claiming `.pdf`:** PDF Tools and PDF Viewer own PDFs.

## Consequences
- The perspective math lives in the kit, shared with Font Maker and Shopping List.
- Doc Scan imports PDF Tools' writer, job runner and drop zone, so installing it downloads those chunks too (as Image Tools does).

## Revision 2026-10-27: as built
- **`path` prop too.** Open with launches a tool with `{ path }`, so the schema takes `path` besides `paths`; both open as pages.
- **Worker always.** Detection (on a 480 px copy) and warping run in one worker shared by every window and sheet (the core `spawn` / `serve` helper), ended after 30 s idle. The long side is 2400 px; the photo is first scaled so it holds 1.25× the output's pixels.
- **B&W** uses `dark_mask` at ratio 0.78 with a radius of 1/40 of the long side, tighter than Font Maker's 1/16, so letters stay solid on a page. Gray stretches the 90th-percentile luma (the paper) to white and the 1st to black.
- **PDF page size:** A4 width (595.28 pt) on the page's short side, the long side in proportion, so pages print at A4 width without letterboxing.
- **`page_size` and `warp`** joined `find_paper` in `$kit/utils/perspective`; Shopping List straightens with them.
- **Magnifier:** `QuadFrame` gained `loupe`: a 96 px circle at 3× with a crosshair, placed clear of the finger. The handles keep `touchstart` from reaching a bottom sheet's swipe-to-dismiss, so a corner dragged down in the phone sheet doesn't drag the sheet.
- **Unsaved pages:** the window is dirty while pages differ from the last saved PDF; Save in the close prompt runs the export.
