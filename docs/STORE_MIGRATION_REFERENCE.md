# Zustand to Svelte 5 Runes Migration Reference

## Key Differences

### Zustand (React)
```typescript
const store = create()(persist((set) => ({ ... }), { name: 'settings' }));
const { theme } = useSettingsStore(); // Hook usage in components
```

### Svelte 5 Runes (Class-based State)
```typescript
class SettingsStore {
  theme = $state({ ... });
  setTheme(theme) { this.theme = { ...this.theme, ...theme }; }
}
export const settingsStore = new SettingsStore();

// Usage: settingsStore.theme (no hooks, no $ prefix needed!)
```

## Complete Conversion Example

### Original Zustand Store
```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: { ... },
      setTheme: (theme) => set((state) => ({ theme: { ...state.theme, ...theme } })),
    }),
    { name: "settings" }
  )
);
```

### Converted Svelte 5 Store with Runes
```typescript
class SettingsStore {
  theme = $state<ThemeSettings>({
    background: '#000',
    foreground: '#fff',
    // ...
  });

  constructor() {
    this.loadFromStorage();
    
    // Auto-persist on changes using $effect
    $effect(() => {
      localStorage.setItem('settings', JSON.stringify({
        theme: this.theme
      }));
    });
  }

  private loadFromStorage() {
    const stored = localStorage.getItem('settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      this.theme = parsed.theme;
    }
  }

  setTheme(theme: Partial<ThemeSettings>) {
    this.theme = { ...this.theme, ...theme };
  }
}

export const settingsStore = new SettingsStore();
```

## Usage Patterns

### 1. **Reading Store Values**

**Zustand:**
```typescript
const theme = useSettingsStore((state) => state.theme);
// or
const theme = useSettingsStore().theme;
```

**Svelte 5 Runes (in components):**
```svelte
<script lang="ts">
  import { settingsStore } from '$lib/core/stores';
  
  // Direct access - automatically reactive!
  // No $ prefix needed, no subscriptions needed
</script>

<!-- Use directly in template -->
<div>{settingsStore.theme.primary}</div>
<div>Position: {settingsStore.taskbar.position}</div>
```

**Svelte 5 Runes (in .ts files):**
```typescript
import { settingsStore } from '$lib/core/stores';

// Direct access - just use it!
const currentTheme = settingsStore.theme;
console.log(currentTheme.primary);

// No need to unsubscribe - runes handle reactivity automatically
```

### 2. **Updating Store Values**

**Zustand:**
```typescript
useSettingsStore.getState().setTheme({ primary: '#ff0000' });
```

**Svelte 5 Runes:**
```typescript
// Same simple API!
settingsStore.setTheme({ primary: '#ff0000' });
```

### 3. **Persistence**

**Zustand:**
Uses `persist` middleware automatically.

**Svelte 5 Runes:**
Use `$effect` to auto-save on changes:

```typescript
class SettingsStore {
  theme = $state<ThemeSettings>({ ... });
  
  constructor() {
    this.loadFromStorage();
    
    // Auto-persist whenever theme changes
    $effect(() => {
      const state = { theme: this.theme };
      localStorage.setItem('settings', JSON.stringify(state));
    });
  }
  
  private loadFromStorage() {
    const stored = localStorage.getItem('settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      this.theme = parsed.theme;
    }
  }
}
```

### 4. **Side Effects**

**Zustand:**
```typescript
setTheme: (theme) => {
  updateTheme(theme); // Side effect
  return set((state) => ({ theme: { ...state.theme, ...theme } }));
}
```

**Svelte 5 Runes:**
Same pattern - call side effect function then update:

```typescript
setTheme(theme: Partial<ThemeSettings>) {
  updateTheme(theme); // Side effect (update CSS vars)
  this.theme = { ...this.theme, ...theme }; // Update state
}
```

### 5. **Derived/Computed Values**

**Zustand:**
```typescript
const isDarkMode = useSettingsStore((state) => 
  state.theme.background === '#000000'
);
```

**Svelte 5 Runes:**
Use `$derived` for computed values:

```typescript
class SettingsStore {
  theme = $state<ThemeSettings>({ ... });
  
  // Computed property - automatically updates when theme changes
  get isDarkMode() {
    return this.theme.background === '#000000';
  }
  
  // Or use $derived rune for more complex computations
  isDark = $derived(this.theme.background === '#000000');
}
```

Usage in component:
```svelte
<script lang="ts">
  import { settingsStore } from '$lib/core/stores';
</script>

<div>Dark mode: {settingsStore.isDarkMode}</div>
<!-- or -->
<div>Dark mode: {settingsStore.isDark}</div>
```

## Store API Comparison

| Feature | Zustand | Svelte |
|---------|---------|--------|
| Create store | `create()` | `writable()` / `readable()` |
| Read value | `useStore()` hook | `$store` or `get(store)` |
| Update value | `set()` / `setState()` | `store.set()` / `store.update()` |
| Subscribe | Auto in components | `$store` or `store.subscribe()` |
| Derived state | Selectors | `derived()` |
| Middleware | `persist()`, etc. | Custom wrapper functions |
| TypeScript | Generic types | Generic types |

## Best Practices

### 1. **Store Organization**
```
src/lib/core/stores/
  ├── index.ts         # Export all stores
  ├── settings.ts      # Settings store
  ├── auth.ts          # Auth store
  └── ui.ts            # UI state store
```

### 2. **TypeScript Typing**
```typescript
// Define types
interface StoreState {
  // ...
}

// Use in store
const store = writable<StoreState>({ ... });
```

### 3. **SSR Considerations**
Always check for `window` when accessing localStorage:

```typescript
if (typeof window !== 'undefined') {
  localStorage.setItem(key, value);
}
```

### 4. **Cleanup**
In components, `$store` syntax auto-unsubscribes. Manual subscriptions need cleanup:

```svelte
<script>
  import { onDestroy } from 'svelte';
  
  const unsubscribe = settingsStore.subscribe((value) => {
    console.log(value);
  });
  
  onDestroy(unsubscribe);
</script>
```

## Common Patterns

### Custom Store with Actions
```typescript
function createCounterStore() {
  const { subscribe, set, update } = writable(0);
  
  return {
    subscribe,
    increment: () => update((n) => n + 1),
    decrement: () => update((n) => n - 1),
    reset: () => set(0),
  };
}

export const counter = createCounterStore();
```

### Multiple Stores
```svelte
<script>
  import { settingsStore, authStore, uiStore } from '$lib/core/stores';
</script>

<div>
  Theme: {$settingsStore.theme.primary}
  User: {$authStore.user?.name}
  Sidebar: {$uiStore.sidebarOpen ? 'Open' : 'Closed'}
</div>
```

### Combining Stores
```typescript
import { derived } from 'svelte/store';

export const userTheme = derived(
  [authStore, settingsStore],
  ([$auth, $settings]) => {
    return $auth.user?.customTheme ?? $settings.theme;
  }
);
```

## Additional Resources

- [Svelte Stores Documentation](https://svelte.dev/docs/svelte-store)
- [Svelte Tutorial - Stores](https://learn.svelte.dev/tutorial/writable-stores)
- Custom store examples in `src/lib/core/stores/`

