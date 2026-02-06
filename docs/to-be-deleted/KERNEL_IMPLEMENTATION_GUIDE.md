# Kernel Implementation Guide

This document explains **how the kernel actually works** in practice:
- How services access other services
- How the kernel tracks calling context (app vs system)
- How capability checking is implemented
- How to inspect service dependencies

---

## 1. How Services Access Other Services

### The Problem

When `AppsService` needs to call `WindowsService`, how does it get access? And how does the kernel know it's a **system call** (not an app call) so it doesn't check capabilities?

### Solution: Kernel Passes Itself to Services

Services receive the kernel instance during initialization, allowing them to access other services:

```typescript
// services/apps.svelte.ts
import type { Kernel } from '@/core/kernel/kernel.svelte';
import type { WindowsService } from '@/core/types/services.types';

export function createAppsService(kernel: Kernel): AppsService {
  // Services can access other services through kernel
  // But they call with 'system' context (no capability checks)
  const windows = kernel.service<WindowsService>('windows');
  
  return {
    launch(options: AppLaunchOptions): WindowId | null {
      // AppsService is a SYSTEM service, so it has full privileges
      // No capability check needed here - this is internal system code
      
      const manifest = this.get(options.appId);
      if (!manifest) throw new Error(`App ${options.appId} not found`);
      
      // Create window (system call, no capability check)
      const windowId = windows.open({
        appId: options.appId,
        props: options.props,
        ...options.window
      });
      
      return windowId;
    },
    
    // ... other methods
  };
}
```

### Service Registration with Kernel Injection

```typescript
// kernel/kernel.svelte.ts
export class KernelImpl implements Kernel {
  private services = new Map<string, ServiceDescriptor>();
  private initialized = false;
  
  register<T>(name: string, descriptor: ServiceDescriptor<T>): void {
    // Store the descriptor
    this.services.set(name, descriptor);
  }
  
  async init(): Promise<void> {
    // 1. Resolve dependency order
    const ordered = this.resolveDependencies();
    
    // 2. Initialize services in order
    for (const name of ordered) {
      const descriptor = this.services.get(name)!;
      
      // If service is a factory function, call it with kernel
      if (typeof descriptor.instance === 'function') {
        descriptor.instance = descriptor.instance(this);
      }
      
      // If service has init method, call it
      if (typeof descriptor.instance.init === 'function') {
        await descriptor.instance.init();
      }
    }
    
    this.initialized = true;
  }
  
  service<T>(name: string, context?: ServiceContext): T {
    const descriptor = this.services.get(name);
    if (!descriptor) {
      throw new Error(`Service '${name}' not found`);
    }
    
    // Track calling context for capability checks
    if (context) {
      this.setContext(context);
    }
    
    return descriptor.instance as T;
  }
}
```

### Service Factory Pattern

Services can be created as factories that receive the kernel:

```typescript
// services/apps.svelte.ts
export function createAppsService(kernel: Kernel): AppsService {
  // Now this service can access other services
  const windows = kernel.service<WindowsService>('windows');
  
  return {
    launch(options) {
      // Use windows service
      return windows.open({ appId: options.appId });
    }
  };
}

// Registration
kernel.register('apps', {
  instance: createAppsService, // Factory function
  dependencies: ['windows']
});
```

---

## 2. How the Kernel Tracks Calling Context

### The Problem

The kernel needs to know:
- **Who** is making the call? (app vs system service)
- **What capabilities** does the caller have?
- **Should** capability checks be enforced?

### Solution: Context Stack

The kernel maintains a **context stack** to track the call chain:

```typescript
// kernel/kernel.svelte.ts

type ServiceContext = 
  | { type: 'app'; appId: string }
  | { type: 'system'; service: string };

export class KernelImpl implements Kernel {
  private contextStack: ServiceContext[] = [];
  private appCapabilities = new Map<string, Set<Capability>>();
  
  /**
   * Get service with context tracking
   */
  service<T>(name: string, context?: ServiceContext): T {
    // Push context onto stack
    if (context) {
      this.contextStack.push(context);
    }
    
    try {
      const descriptor = this.services.get(name);
      if (!descriptor) {
        throw new Error(`Service '${name}' not found`);
      }
      
      return descriptor.instance as T;
    } finally {
      // Pop context when done
      if (context) {
        this.contextStack.pop();
      }
    }
  }
  
  /**
   * Get current calling context
   */
  private getCurrentContext(): ServiceContext | null {
    return this.contextStack[this.contextStack.length - 1] || null;
  }
  
  /**
   * Check if current context is system (no capability check needed)
   */
  private isSystemContext(): boolean {
    const context = this.getCurrentContext();
    return context?.type === 'system';
  }
  
  /**
   * Assert capability (only for app contexts)
   */
  assert(appId: string, capability: Capability): void {
    // System services bypass capability checks
    if (this.isSystemContext()) {
      return; // ✅ System call, no check needed
    }
    
    // App calls need capability check
    const capabilities = this.appCapabilities.get(appId) || new Set();
    if (!this.hasCapability(capabilities, capability)) {
      throw new Error(
        `App '${appId}' does not have capability '${capability}'`
      );
    }
  }
}
```

### How Apps Call Services (With Context)

```typescript
// In an app component
<script lang="ts">
  import { kernel } from '@/core/kernel';
  import { useWindow } from '@/core/contexts/window-context.svelte';
  
  const window = useWindow(); // Gets window context with appId
  
  // App calls service WITH context
  const files = kernel.service<FilesService>('files', {
    type: 'app',
    appId: window.appId  // ← Context passed here
  });
  
  async function save() {
    // Kernel checks capabilities for this app
    await files.write('/documents/file.txt', content);
    // ↑ Kernel.assert(window.appId, 'fs:write:/documents/**')
  }
</script>
```

### How Services Call Other Services (System Context)

```typescript
// services/apps.svelte.ts
export function createAppsService(kernel: Kernel): AppsService {
  return {
    launch(options: AppLaunchOptions): WindowId | null {
      // Service calls with 'system' context (no capability check)
      const windows = kernel.service<WindowsService>('windows', {
        type: 'system',
        service: 'apps'  // ← System context
      });
      
      // This call bypasses capability checks
      return windows.open({ appId: options.appId });
    }
  };
}
```

### Automatic Context Propagation

For convenience, the kernel can automatically track context:

```typescript
// kernel/kernel.svelte.ts

export class KernelImpl implements Kernel {
  private currentAppId: string | null = null;
  
  /**
   * Set current app context (called by window context)
   */
  setAppContext(appId: string): void {
    this.currentAppId = appId;
  }
  
  /**
   * Clear app context
   */
  clearAppContext(): void {
    this.currentAppId = null;
  }
  
  /**
   * Get service with automatic context detection
   */
  service<T>(name: string): T {
    const descriptor = this.services.get(name);
    if (!descriptor) {
      throw new Error(`Service '${name}' not found`);
    }
    
    // If we're in an app context, use it
    const context: ServiceContext | undefined = this.currentAppId
      ? { type: 'app', appId: this.currentAppId }
      : { type: 'system', service: 'kernel' };
    
    return this.serviceWithContext<T>(name, context);
  }
}
```

---

## 3. How Capability Checking Works

### Service Methods Check Capabilities

Each service method that needs protection checks capabilities:

```typescript
// services/files.svelte.ts
export function createFilesService(kernel: Kernel): FilesService {
  return {
    async write(path: FilePath, data: string | Blob): Promise<void> {
      // Get current app context
      const context = kernel.getCurrentContext();
      
      if (context?.type === 'app') {
        // Check capability for this app
        kernel.assert(context.appId, `fs:write:${path}`);
      }
      // System services bypass (context.type === 'system')
      
      // Perform the actual write
      await this.doWrite(path, data);
    },
    
    async read<T>(path: FilePath): Promise<T> {
      const context = kernel.getCurrentContext();
      
      if (context?.type === 'app') {
        kernel.assert(context.appId, `fs:read:${path}`);
      }
      
      return await this.doRead(path);
    }
  };
}
```

### Capability Pattern Matching

```typescript
// kernel/capabilities.ts

export function hasCapability(
  granted: Set<Capability>,
  required: Capability
): boolean {
  // Exact match
  if (granted.has(required)) {
    return true;
  }
  
  // Pattern matching for wildcards
  // e.g., 'fs:read:/documents/**' matches 'fs:read:/documents/file.txt'
  for (const capability of granted) {
    if (matchesPattern(capability, required)) {
      return true;
    }
  }
  
  return false;
}

function matchesPattern(pattern: string, value: string): boolean {
  // Convert pattern to regex
  // 'fs:read:/documents/**' → /^fs:read:\/documents\/.*$/
  const regex = new RegExp(
    '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
  );
  
  return regex.test(value);
}

// Examples:
// 'fs:read:/documents/**' matches 'fs:read:/documents/file.txt' ✅
// 'fs:read:/documents/**' matches 'fs:read:/documents/sub/file.txt' ✅
// 'fs:read:/documents/**' does NOT match 'fs:read:/system/config' ❌
```

---

## 4. How to Inspect Service Dependencies

### Get Service Dependency Graph

```typescript
// kernel/kernel.svelte.ts

export class KernelImpl implements Kernel {
  /**
   * Get dependency graph
   */
  getDependencyGraph(): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    for (const [name, descriptor] of this.services) {
      graph.set(name, descriptor.dependencies || []);
    }
    
    return graph;
  }
  
  /**
   * Get services that depend on a service
   */
  getDependents(serviceName: string): string[] {
    const dependents: string[] = [];
    
    for (const [name, descriptor] of this.services) {
      if (descriptor.dependencies?.includes(serviceName)) {
        dependents.push(name);
      }
    }
    
    return dependents;
  }
  
  /**
   * Get all services a service depends on (transitive)
   */
  getDependencies(serviceName: string): string[] {
    const visited = new Set<string>();
    const deps: string[] = [];
    
    const traverse = (name: string) => {
      if (visited.has(name)) return;
      visited.add(name);
      
      const descriptor = this.services.get(name);
      if (!descriptor) return;
      
      for (const dep of descriptor.dependencies || []) {
        if (!visited.has(dep)) {
          deps.push(dep);
          traverse(dep);
        }
      }
    };
    
    traverse(serviceName);
    return deps;
  }
}
```

### Usage Example

```typescript
// Debug tool
const kernel = kernelInstance;

// What depends on windows?
const dependents = kernel.getDependents('windows');
console.log('Services that depend on windows:', dependents);
// ['apps', 'shell']

// What does apps depend on?
const deps = kernel.getDependencies('apps');
console.log('Apps service dependencies:', deps);
// ['windows', 'files']

// Full dependency graph
const graph = kernel.getDependencyGraph();
console.log('Dependency graph:', graph);
// Map {
//   'windows' => [],
//   'files' => [],
//   'apps' => ['windows', 'files'],
//   'shell' => ['windows', 'apps']
// }
```

---

## 5. Complete Example: AppsService Implementation

Here's a complete example showing how it all works together:

```typescript
// services/apps.svelte.ts
import type { Kernel } from '@/core/kernel/kernel.svelte';
import type { WindowsService } from '@/core/types/services.types';
import type { AppsService, AppManifest, AppLaunchOptions } from '@/core/types/services.types';

export function createAppsService(kernel: Kernel): AppsService {
  // Get dependencies (system context, no capability check)
  const windows = kernel.service<WindowsService>('windows', {
    type: 'system',
    service: 'apps'
  });
  
  // Service state
  const registry = new Map<string, AppManifest>();
  const instances = new Map<string, AppInstance>();
  
  return {
    register(manifest: AppManifest): void {
      // System service, no capability check needed
      registry.set(manifest.id, manifest);
      
      // Auto-grant capabilities from manifest
      kernel.grant(manifest.id, manifest.capabilities);
      
      kernel.emit('app:registered', { appId: manifest.id });
    },
    
    launch(options: AppLaunchOptions): WindowId | null {
      const manifest = registry.get(options.appId);
      if (!manifest) {
        throw new Error(`App '${options.appId}' not found`);
      }
      
      // Check if single instance and already running
      if (manifest.singleInstance) {
        const existing = instances.get(options.appId);
        if (existing && existing.windowIds.length > 0) {
          // Focus existing window
          windows.focus(existing.windowIds[0]);
          return existing.windowIds[0];
        }
      }
      
      // Create window (system call, no capability check)
      const windowId = windows.open({
        appId: options.appId,
        props: options.props,
        ...options.window
      });
      
      // Track instance
      const instance = instances.get(options.appId) || {
        appId: options.appId,
        windowIds: [],
        state: 'active',
        launchedAt: new Date()
      };
      instance.windowIds.push(windowId);
      instances.set(options.appId, instance);
      
      kernel.emit('app:launched', { appId: options.appId, windowId });
      
      return windowId;
    },
    
    get(appId: string): AppManifest | undefined {
      return registry.get(appId);
    },
    
    list(): AppManifest[] {
      return Array.from(registry.values());
    },
    
    // ... other methods
  };
}
```

### Registration

```typescript
// main.ts
import { kernel } from '@/core/kernel';
import { createAppsService } from '@/core/services/apps.svelte';
import { createWindowsService } from '@/core/services/windows.svelte';

// Register services (order matters for dependencies)
kernel.register('windows', {
  instance: createWindowsService,
  dependencies: [],
  priority: 1
});

kernel.register('apps', {
  instance: createAppsService,
  dependencies: ['windows'],  // ← Declares dependency
  priority: 2
});

// Initialize (resolves dependencies automatically)
await kernel.init();
```

---

## 6. Summary: The Flow

### App Calls Service

```
1. App component calls: files.write('/documents/file.txt', data)
2. FilesService.write() checks: kernel.getCurrentContext()
3. Context is: { type: 'app', appId: 'text-editor' }
4. Kernel.assert('text-editor', 'fs:write:/documents/file.txt')
5. Capability check: Does 'text-editor' have 'fs:write:/documents/**'?
6. If yes: ✅ Proceed with write
7. If no: ❌ Throw error
```

### Service Calls Service

```
1. AppsService.launch() calls: windows.open({ appId: 'text-editor' })
2. WindowsService.open() checks: kernel.getCurrentContext()
3. Context is: { type: 'system', service: 'apps' }
4. Kernel sees system context → ✅ Skip capability check
5. Proceed with window creation
```

### Key Points

1. **Services get kernel** during initialization
2. **Services call other services** through kernel with system context
3. **Apps call services** with app context (from window context)
4. **Kernel tracks context** via context stack
5. **Capability checks** only apply to app contexts
6. **System services** bypass capability checks

---

## 7. Debugging Tools

### Inspect Current Context

```typescript
// Add to kernel
getCurrentContext(): ServiceContext | null {
  return this.contextStack[this.contextStack.length - 1] || null;
}

// Usage
console.log('Current context:', kernel.getCurrentContext());
// { type: 'app', appId: 'text-editor' }
// or
// { type: 'system', service: 'apps' }
```

### Trace Service Calls

```typescript
// Add to kernel
private callTrace: Array<{ service: string; context: ServiceContext }> = [];

service<T>(name: string, context?: ServiceContext): T {
  if (context) {
    this.callTrace.push({ service: name, context });
  }
  
  // ... rest of implementation
}

getCallTrace(): Array<{ service: string; context: ServiceContext }> {
  return [...this.callTrace];
}
```

---

This implementation provides:
- ✅ **Clear separation** between app and system calls
- ✅ **Automatic capability enforcement** for apps
- ✅ **System service privileges** (no checks needed)
- ✅ **Dependency tracking** and inspection
- ✅ **Debugging tools** for troubleshooting

