import kernel from "$lib/core/api";
import type { ServiceInfo } from "./graph";

export function live_services(): ServiceInfo[] {
  return [...kernel.services.entries()].map(([key, service]) => ({ key, name: service.name, dependencies: kernel.dependencies(key) }));
}

export function service_page(key: string): string {
  return `system/services/${key}`;
}
