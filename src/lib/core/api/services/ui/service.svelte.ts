import type { UiOverlay, UiService as IUiService } from "./type";

export class UiService implements IUiService {
  name = "UiService";
  description = "Shell overlay state: launcher and switcher";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return `UiService: ${this.overlay ?? "nothing"} open`;
  }

  public overlay = $state<UiOverlay | null>(null);

  public open(overlay: UiOverlay): void {
    this.overlay = overlay;
  }

  public close(): void {
    this.overlay = null;
  }

  public toggle(overlay: UiOverlay): void {
    this.overlay = this.overlay === overlay ? null : overlay;
  }
}
