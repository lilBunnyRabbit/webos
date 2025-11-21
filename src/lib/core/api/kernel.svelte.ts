import type { ServiceDescriptor,IService } from './api.type';

export class Kernel {
  private services: Map<string, ServiceDescriptor<IService>> = new Map();

  register<T extends IService>(name: string, service: ServiceDescriptor<T>) {
    this.services.set(name, service);
  }
}