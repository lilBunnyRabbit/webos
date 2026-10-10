import type { ServiceDescriptor, IService } from "../type";
import { SvelteMap } from "svelte/reactivity";
import { register_default_services } from "./init";

export class Kernel {
  private is_initialized = false;

  readonly services: Map<string, IService> = new SvelteMap();
  private readonly descriptors: Map<string, ServiceDescriptor<IService>> = new Map();
  private init_order: string[] = [];

  public async init(): Promise<Kernel> {
    if (this.is_initialized) {
      return this;
    }

    register_default_services(this);

    this.init_order = this.resolve_order();
    for (const name of this.init_order) {
      const instance = new (this.descriptors.get(name)!.instance)(this);
      await instance.init?.();
      this.services.set(name, instance);
    }

    this.is_initialized = true;

    return this;
  }

  public register<T extends IService>(name: string, descriptor: ServiceDescriptor<T>) {
    if (this.is_initialized) {
      throw new Error(`Service "${name}" registered after kernel init`);
    }

    if (this.descriptors.has(name)) {
      console.warn(`Overwriting service "${name}"`);
    }

    this.descriptors.set(name, descriptor);
  }

  public service<T extends IService>(name: string): T {
    if (!this.services.has(name)) {
      throw new Error(`Service "${name}" not found`);
    }

    return this.services.get(name)! as T;
  }

  public shutdown() {
    if (!this.is_initialized) {
      return;
    }

    for (const name of [...this.init_order].reverse()) {
      try {
        this.services.get(name)?.destroy?.();
      } catch (error) {
        console.error(`Failed to destroy service "${name}":`, error);
      }
    }

    this.is_initialized = false;
  }

  private resolve_order(): string[] {
    const order: string[] = [];
    const visiting = new Set<string>();

    const visit = (name: string, path: string[]) => {
      if (order.includes(name)) return;
      if (visiting.has(name)) {
        throw new Error(`Circular service dependency: ${[...path, name].join(" -> ")}`);
      }

      const descriptor = this.descriptors.get(name);
      if (!descriptor) {
        throw new Error(`Service "${name}" not registered (required by "${path.at(-1)}")`);
      }

      visiting.add(name);
      for (const dependency of descriptor.dependencies ?? []) {
        visit(dependency, [...path, name]);
      }
      visiting.delete(name);

      order.push(name);
    };

    for (const name of this.descriptors.keys()) {
      visit(name, []);
    }

    return order;
  }
}
