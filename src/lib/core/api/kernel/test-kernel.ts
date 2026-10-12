// Through the barrel: importing kernel.svelte directly starts the service graph mid-cycle.
import { Kernel, type IService } from "$lib/core/api";

type ServiceEntry = (new (kernel: Kernel) => IService) | IService;

/**
 * Tests only (ADR-027). A real Kernel holding just `services`, built and initialised in the order given, so list
 * dependencies first. An object instead of a class is used as-is: a stand-in for a service the test can't drive,
 * such as dialogs that only resolve through UI.
 */
export async function boot_test_kernel(services: Record<string, ServiceEntry>): Promise<{ kernel: Kernel; shutdown: () => void }> {
  const kernel = new Kernel();
  const booted: IService[] = [];

  for (const [name, entry] of Object.entries(services)) {
    const service = typeof entry === "function" ? new entry(kernel) : entry;
    await service.init?.();
    kernel.services.set(name, service);
    booted.push(service);
  }

  return {
    kernel,
    shutdown() {
      for (const service of booted.reverse()) service.destroy?.();
      kernel.services.clear();
    },
  };
}

/** A stand-in service with only the members a test needs. */
export function stub_service<T>(name: string, members: Partial<T>): IService {
  return { name, description: `${name} stub`, to_string: () => `${name} stub`, ...members };
}
