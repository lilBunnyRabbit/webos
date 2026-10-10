import type { Kernel } from "./kernel/kernel.svelte";
// TODO: kernel to interface

export interface IService {
  name: string;
  description: string;
  init?(): Promise<void> | void;
  /** Sync on purpose: unload never awaits, so async cleanup would silently not run. */
  destroy?(): void;
  to_string(): string;
}

export interface ServiceDescriptor<T extends IService> {
  instance: new (kernel: Kernel) => T;
  dependencies?: string[];
}
