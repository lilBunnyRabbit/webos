import { SvelteMap } from "svelte/reactivity";

export class Order<T> extends SvelteMap<T, number> {
  private max_z_index = 0;

  public add(item: T) {
    this.set(item, ++this.max_z_index);
    return this;
  }

  public remove(item: T) {
    this.delete(item);

    if (!this.size) this.max_z_index = 0;

    return this;
  }

  public to_front(item: T) {
    if (!this.has(item)) return this;
    this.set(item, ++this.max_z_index);
    return this;
  }

  public is_focused(item: T) {
    return this.get(item) === this.max_z_index;
  }
}
