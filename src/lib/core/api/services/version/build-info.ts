import type { VersionInfo } from "./type";

declare const __VERSION_INFO__: VersionInfo;

/**
 * The dev server's and tests' build stamp, for the glob catalogue. A build never imports it: the running release comes
 * from the catalogue, so an app-only deploy leaves the bundle as it was (ADR-077). The catalogue plugin fails the build
 * if a chunk holds it.
 */
export const BUILD_INFO: VersionInfo = __VERSION_INFO__;
