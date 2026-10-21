import type { VersionInfo } from "./type";

declare const __VERSION_INFO__: VersionInfo;

/** The only reader of the build stamp. It changes every build, so `vite.config.ts` keeps this module and whatever imports it out of the shared core chunk. */
export const BUILD_INFO: VersionInfo = __VERSION_INFO__;
