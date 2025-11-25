import type { Kernel } from "./kernel/kernel.svelte";
// TODO: kernel to interface


export interface IService {
  name: string;
  description: string;
}

export interface ServiceDescriptor<T extends IService> {
  instance: new (kernel: Kernel) => T;
  dependencies?: string[];
  // priority?: number;
}