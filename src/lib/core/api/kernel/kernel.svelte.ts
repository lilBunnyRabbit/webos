import type { ServiceDescriptor, IService } from "../type";
import { SvelteMap } from "svelte/reactivity";
import { register_default_services } from "./init";

type ResolveServicePromise<T extends IService> = (service: T) => void;

/*
- get service is a promise that resolves when service is added to the kernel (optional promise) - awaitable
*/

export class Kernel {
  private is_initialized = false;

  readonly services: Map<string, IService> = new SvelteMap();
  readonly pending_services: Map<string, ServiceDescriptor<IService>> = new Map();
  readonly service_promises: Map<string, Array<ResolveServicePromise<IService>>> = new Map();

  constructor() {}

  public async init(): Promise<Kernel> {
    if (this.is_initialized) {
      return this;
    }

    register_default_services(this);

    this.is_initialized = true;

    return this;
  }

  private has_dependencies(dependencies?: string[]) {
    return !dependencies || dependencies.every((dependency) => this.services.has(dependency));
  }

  // This needs some work. the pending services need to be check if they resolve each other.
  private check_pending_services() {
    for (const [name, service] of this.pending_services) {
      if (this.has_dependencies(service.dependencies)) {
        this.pending_services.delete(name);
        this.register(name, service);
        break;
      }
    }
  }

  public register<T extends IService>(name: string, service: ServiceDescriptor<T>) {
    if (this.services.has(name)) {
      console.warn(`Overwriting service "${name}"`);
    }

    // check if service needs deps
    // check if adding the service resolves pending service
    // if service is pending, add it to the pending services
    // if service is not pending, add it to the services
    // if pending service resolves this service then add it to the services (circular dependency)
    if (this.has_dependencies(service.dependencies)) {
      const instance = new service.instance();
      this.services.set(name, instance);

      const promises = this.service_promises.get(name);
      if (promises) {
        for (const resolve_promise of promises) {
          resolve_promise(instance);
        }
      }

      this.service_promises.delete(name);

      this.check_pending_services();
    } else {
      this.pending_services.set(name, service);
    }
  }

  // get service is a promise that resolves when service is added to the kernel (optional promise) - awaitable
  public service<T extends IService>(name: string): T {
    if (!this.services.has(name)) {
      throw new Error(`Service "${name}" not found`);
    }

    return this.services.get(name)! as T;
  }

  public async await_service<T extends IService>(name: string): Promise<T> {
    const service = this.services.get(name) as T | undefined;
    if (service) {
      return service;
    }

    return new Promise((resolve: ResolveServicePromise<T>) => {
      if (this.service_promises.has(name)) {
        this.service_promises.get(name)!.push(resolve as ResolveServicePromise<IService>);
      } else {
        this.service_promises.set(name, [resolve as ResolveServicePromise<IService>]);
      }
    });
  }
}
