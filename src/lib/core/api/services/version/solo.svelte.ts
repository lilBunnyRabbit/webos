import { VersionService } from "./service.svelte";

/**
 * A solo link (ADR-047) is for someone using one app: no introduction, sample files, update notices or polling, and the
 * seen marker stays untouched so their own WebOS still shows what's new.
 */
export class SoloVersionService extends VersionService {
  override name = "SoloVersionService";
  override description = "Solo mode: build info and release notes, no introduction or update notices";

  override async init(): Promise<void> {}
}
