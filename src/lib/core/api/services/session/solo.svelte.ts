import { SessionService } from "./service.svelte";

/** A solo link (ADR-047) shows one app: no Restore dialog, and the person's saved session in their own WebOS stays as it was. */
export class SoloSessionService extends SessionService {
  override name = "SoloSessionService";
  override description = "Solo mode: never restores or saves windows";

  override async init(): Promise<void> {}
}
