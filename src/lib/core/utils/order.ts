import { SvelteMap } from "svelte/reactivity";

export class Order<T> extends SvelteMap<T, number> {
  private maxZIndex = 0;

  public add(item: T) {
    this.set(item, ++this.maxZIndex);
    return this;
  }

  public remove(item: T) {
    this.delete(item);

    if (!this.size) this.maxZIndex = 0;

    return this;
  }

  public toFront(item: T) {
    if (!this.has(item)) return this;
    this.set(item, ++this.maxZIndex);
    return this;
  }

  public isFocused(item: T) {
    return this.get(item) === this.maxZIndex;
  }
}
