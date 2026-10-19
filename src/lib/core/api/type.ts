import type { Component } from "svelte";
import type { Kernel } from "./kernel/kernel.svelte";
import type { ShellContribution } from "./services/shell/type";
// TODO: kernel to interface

export interface IService {
  name: string;
  description: string;
  init?(): Promise<void> | void;
  /**
   * The kernel never awaits this: unload can't, so cleanup that must run is synchronous. A returned promise is pending
   * work (a save already on its way) that only the test kernel's shutdown awaits.
   */
  destroy?(): void | Promise<void>;
  to_string(): string;
  /**
   * Kernel app view of this service, lazy so it never loads at boot (ADR-020).
   * `never` lets a component typed for one concrete service fit here; the Kernel app supplies the matching service.
   */
  inspector?: () => Promise<{ default: Component<InspectorProps<never>> }>;
  /** Commands, completers and value types this service adds to the shell (ADR-033). Read whenever services change. */
  shell?(): ShellContribution;
}

export interface InspectorProps<T extends IService = IService> {
  service: T;
  /** Basic view is always shown; `true` adds the detailed view below it. */
  detailed: boolean;
}

export interface ServiceDescriptor<T extends IService> {
  instance: new (kernel: Kernel) => T;
  dependencies?: string[];
}
