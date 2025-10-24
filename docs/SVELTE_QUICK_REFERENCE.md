# Svelte 5 Quick Reference for React Developers

Quick lookup guide for common React → Svelte 5 patterns during migration.

---

## Syntax Comparison

### Component Definition

```tsx
// React
interface Props {
  name: string;
  count?: number;
}

export function MyComponent({ name, count = 0 }: Props) {
  return <div>Hello {name}</div>;
}
```

```svelte
<!-- Svelte -->
<script lang="ts">
  let { name, count = 0 } = $props<{
    name: string;
    count?: number;
  }>();
</script>

<div>Hello {name}</div>
```

---

## State Management

### Local State

```tsx
// React
const [count, setCount] = useState(0);
const [user, setUser] = useState({ name: 'John' });

setCount(count + 1);
setUser({ ...user, name: 'Jane' });
```

```svelte
<!-- Svelte -->
<script>
  let count = $state(0);
  let user = $state({ name: 'John' });

  count = count + 1; // or count++
  user.name = 'Jane'; // Direct mutation!
</script>
```

### Computed Values

```tsx
// React
const doubled = useMemo(() => count * 2, [count]);
```

```svelte
<!-- Svelte -->
<script>
  const doubled = $derived(count * 2);
</script>
```

### Effects

```tsx
// React
useEffect(() => {
  console.log('Count changed:', count);
  return () => console.log('Cleanup');
}, [count]);
```

```svelte
<!-- Svelte -->
<script>
  $effect(() => {
    console.log('Count changed:', count);
    return () => console.log('Cleanup');
  });
</script>
```

### Global Stores

```typescript
// React (Zustand)
import { create } from 'zustand';

const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));

// Usage
const count = useStore((state) => state.count);
```

```typescript
// Svelte (Runes)
// store.svelte.ts
const state = $state({ count: 0 });

export const store = $derived(state);

export const StoreAPI = {
  increment() {
    state.count++;
  },
};

// Usage in component
import { store, StoreAPI } from './store.svelte';
// Just use: store.count
```

---

## Conditional Rendering

```tsx
// React
{show && <div>Visible</div>}
{show ? <div>Yes</div> : <div>No</div>}
```

```svelte
<!-- Svelte -->
{#if show}
  <div>Visible</div>
{/if}

{#if show}
  <div>Yes</div>
{:else}
  <div>No</div>
{/if}
```

---

## Lists

```tsx
// React
{items.map(item => (
  <div key={item.id}>{item.name}</div>
))}
```

```svelte
<!-- Svelte -->
{#each items as item (item.id)}
  <div>{item.name}</div>
{/each}
```

---

## Events

```tsx
// React
<button onClick={() => handleClick()}>Click</button>
<input onChange={(e) => setValue(e.target.value)} />
```

```svelte
<!-- Svelte -->
<button onclick={() => handleClick()}>Click</button>
<input oninput={(e) => value = e.currentTarget.value} />

<!-- Or with bind: -->
<input bind:value />
```

---

## Refs / Element Binding

```tsx
// React
const ref = useRef<HTMLDivElement>(null);

useEffect(() => {
  console.log(ref.current?.offsetWidth);
}, []);

<div ref={ref}>Content</div>
```

```svelte
<!-- Svelte -->
<script>
  let ref = $state<HTMLDivElement | null>(null);

  $effect(() => {
    console.log(ref?.offsetWidth);
  });
</script>

<div bind:this={ref}>Content</div>
```

---

## Children / Slots

```tsx
// React
interface Props {
  children: React.ReactNode;
}

function Wrapper({ children }: Props) {
  return <div className="wrapper">{children}</div>;
}
```

```svelte
<!-- Svelte -->
<script lang="ts">
  let { children } = $props<{ children?: any }>();
</script>

<div class="wrapper">
  {@render children?.()}
</div>
```

---

## Class Names

```tsx
// React
import { cn } from '@/lib/utils';

<div className={cn("base", isActive && "active", className)} />
```

```svelte
<!-- Svelte -->
<script>
  import { cn } from '@/lib/utils';
  let { class: className } = $props(); // 'class' is reserved
</script>

<div class={cn("base", isActive && "active", className)} />

<!-- Or use class: directive -->
<div class="base" class:active={isActive}>
```

---

## Async Data / Suspense

```tsx
// React
const MyComponent = React.lazy(() => import('./MyComponent'));

<Suspense fallback={<Loading />}>
  <MyComponent />
</Suspense>
```

```svelte
<!-- Svelte -->
<script>
  let ComponentPromise = import('./MyComponent.svelte');
</script>

{#await ComponentPromise}
  <Loading />
{:then module}
  <svelte:component this={module.default} />
{/await}
```

---

## Context (React) → Stores (Svelte)

```tsx
// React
const ThemeContext = createContext<Theme | null>(null);

function Provider({ children }) {
  const [theme, setTheme] = useState('dark');
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

function Consumer() {
  const { theme } = useContext(ThemeContext);
  return <div>{theme}</div>;
}
```

```typescript
// Svelte - theme.svelte.ts
const state = $state({ theme: 'dark' });

export const theme = $derived(state.theme);

export const ThemeAPI = {
  setTheme(newTheme: string) {
    state.theme = newTheme;
  },
};
```

```svelte
<!-- Consumer.svelte -->
<script>
  import { theme } from './theme.svelte';
</script>

<div>{theme}</div>
```

---

## Lifecycle

```tsx
// React
useEffect(() => {
  // On mount
  return () => {
    // On unmount
  };
}, []);

useEffect(() => {
  // On update
});
```

```svelte
<!-- Svelte -->
<script>
  import { onMount } from 'svelte';

  onMount(() => {
    // On mount
    return () => {
      // On unmount
    };
  });

  $effect(() => {
    // On every update (reactive)
  });
</script>
```

---

## Forms

```tsx
// React
const [value, setValue] = useState('');

<input
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>
```

```svelte
<!-- Svelte -->
<script>
  let value = $state('');
</script>

<input bind:value />
```

---

## Styling

```tsx
// React
<div className="text-lg bg-blue-500" style={{ width: 100 }}>
```

```svelte
<!-- Svelte -->
<div class="text-lg bg-blue-500" style:width="100px">

<!-- Scoped styles -->
<style>
  div {
    /* Only applies to div in this component */
  }
</style>
```

---

## Portal / Teleport

```tsx
// React
import { createPortal } from 'react-dom';

createPortal(<div>Modal</div>, document.body);
```

```svelte
<!-- Svelte -->
<script>
  import { mount } from 'svelte';
</script>

<svelte:body>
  <div>Modal</div>
</svelte:body>
```

---

## Error Boundaries

```tsx
// React
<ErrorBoundary fallback={<Error />}>
  <Component />
</ErrorBoundary>
```

```svelte
<!-- Svelte - Manual -->
<script>
  let error = $state<Error | null>(null);
  
  try {
    // Component code
  } catch (e) {
    error = e;
  }
</script>

{#if error}
  <Error {error} />
{:else}
  <Component />
{/if}
```

---

## Forwarding Props

```tsx
// React
function Button({ children, ...props }: ButtonProps) {
  return <button {...props}>{children}</button>;
}
```

```svelte
<!-- Svelte -->
<script>
  let { children, ...restProps } = $props();
</script>

<button {...restProps}>
  {@render children?.()}
</button>
```

---

## Dynamic Components

```tsx
// React
const Component = components[type];
<Component {...props} />
```

```svelte
<!-- Svelte -->
<script>
  let Component = components[type];
</script>

<svelte:component this={Component} {...props} />
```

---

## Memoization

```tsx
// React
const expensive = useMemo(() => {
  return computeExpensive(data);
}, [data]);

const memoized = useCallback(() => {
  doSomething(value);
}, [value]);
```

```svelte
<!-- Svelte -->
<script>
  // Automatically memoized with $derived
  const expensive = $derived(computeExpensive(data));
  
  // Functions don't need memoization (no re-renders)
  function memoized() {
    doSomething(value);
  }
</script>
```

---

## Transitions

```tsx
// React (with library)
import { motion } from 'framer-motion';

<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
/>
```

```svelte
<!-- Svelte (built-in) -->
<script>
  import { fade, fly } from 'svelte/transition';
</script>

<div transition:fade>Content</div>
<div in:fly={{ y: 200 }} out:fade>Content</div>
```

---

## TanStack Query

```tsx
// React
import { useQuery } from '@tanstack/react-query';

const { data, isLoading } = useQuery({
  queryKey: ['todos'],
  queryFn: fetchTodos,
});
```

```svelte
<!-- Svelte -->
<script>
  import { createQuery } from '@tanstack/svelte-query';

  const query = createQuery(() => ({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  }));
</script>

{#if $query.isLoading}
  Loading...
{:else if $query.data}
  {$query.data.length} todos
{/if}
```

---

## Common Pitfalls

### 1. Reactivity on Arrays/Objects

```svelte
<!-- ❌ Won't trigger reactivity -->
<script>
  let items = $state([1, 2, 3]);
  items.push(4); // Mutating doesn't trigger update
</script>

<!-- ✅ Correct -->
<script>
  let items = $state([1, 2, 3]);
  items = [...items, 4]; // Reassignment triggers update
</script>
```

### 2. Class vs className

```svelte
<!-- ❌ Wrong -->
<div className="text-lg" />

<!-- ✅ Correct -->
<div class="text-lg" />
```

### 3. Event Names

```svelte
<!-- ❌ Wrong (React style) -->
<button onClick={handler} />

<!-- ✅ Correct -->
<button onclick={handler} />
```

### 4. Boolean Attributes

```svelte
<!-- ❌ Wrong -->
<button disabled={true} />

<!-- ✅ Correct -->
<button disabled />
<button {disabled} /> <!-- If variable -->
```

---

## File Extensions

```
React          →  Svelte
--------------------------
.tsx           →  .svelte
.jsx           →  .svelte
.ts (stores)   →  .svelte.ts (if using runes)
.ts (utils)    →  .ts (unchanged)
```

---

## Import Differences

```typescript
// React
import React, { useState, useEffect } from 'react';
import { Component } from './Component.tsx';

// Svelte
import { onMount } from 'svelte';
import Component from './Component.svelte';
```

---

## Key Advantages in Svelte

1. **No hooks rules** - Use reactive statements anywhere
2. **No dependency arrays** - Reactivity is automatic
3. **Direct mutations** - No spreading/cloning needed with $state
4. **Built-in transitions** - No extra library
5. **Scoped CSS** - No CSS modules or CSS-in-JS needed
6. **Less boilerplate** - Fewer files, less code
7. **Better performance** - Compiler optimizes everything

---

## When You're Stuck

1. **Think in reactive statements** not re-renders
2. **Use $derived** instead of useMemo
3. **Use $effect** instead of useEffect
4. **Direct mutation works** with $state
5. **No need to memoize** functions (no re-renders!)
6. **Stores are simple** - just export from .svelte.ts files

---

## Quick Wins

```svelte
<!-- Two-way binding -->
<input bind:value />

<!-- Class conditionals -->
<div class:active={isActive} />

<!-- Multiple classes -->
<div class:text-lg class:font-bold={isBold} />

<!-- Style binding -->
<div style:color={themeColor} />

<!-- Element dimensions -->
<div bind:clientWidth bind:clientHeight />

<!-- Auto-subscriptions -->
<script>
  import { writable } from 'svelte/store';
  const count = writable(0);
</script>
{$count} <!-- Auto-subscribes and unsubscribes -->
```

---

## Remember

- **Components run once** (not on every render)
- **Reactivity is automatic** (no dependency arrays)
- **Direct mutations work** (with $state)
- **Less is more** (less code, same functionality)

Happy coding! 🎉

