export class Flags<T> extends Set<T> {
  public every(...flags: T[]) {
    return flags.every((flag) => this.has(flag));
  }

  public some(...flags: T[]) {
    return flags.some((flag) => this.has(flag));
  }

  public none(...flags: T[]) {
    return flags.every((flag) => !this.has(flag));
  }

  public map(...flags: T[]) {
    return flags.map((flag) => this.has(flag));
  }

  public toggle(flag: T) {
    if (this.has(flag)) {
      this.delete(flag);
    } else {
      this.add(flag);
    }

    return this;
  }

  public clone() {
    return new Flags(this);
  }
}
