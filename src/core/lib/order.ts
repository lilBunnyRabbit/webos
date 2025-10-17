export class Order<T> extends Map<T, number> {
  public add(item: T) {
    this.set(item, this.size);
    return this;
  }

  public remove(item: T) {
    if (!this.has(item)) return this;

    const prevOrder = this.get(item)!;
    this.delete(item);

    for (const [key, value] of this.entries()) {
      if (key !== item && value > prevOrder) {
        this.set(key, value - 1);
      }
    }

    return this;
  }

  public toFront(item: T) {
    if (!this.has(item)) return this;

    const prevOrder = this.get(item)!;
    this.set(item, this.size - 1);

    for (const [key, value] of this.entries()) {
      if (key !== item && value > prevOrder) {
        this.set(key, value - 1);
      }
    }

    return this;
  }

  public isFocused(item: T) {
    return this.get(item) === this.size - 1;
  }

  public clone() {
    return new Order(this);
  }
}
