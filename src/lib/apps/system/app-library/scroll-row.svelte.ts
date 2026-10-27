export class ScrollRow {
  at_start = $state(true);
  at_end = $state(true);
  private element: HTMLElement | null = null;

  readonly attach = (element: HTMLElement) => {
    this.element = element;
    const update = () => {
      this.at_start = element.scrollLeft <= 1;
      this.at_end = element.scrollLeft + element.clientWidth >= element.scrollWidth - 1;
    };
    const resize = new ResizeObserver(update);
    resize.observe(element);
    const mutation = new MutationObserver(update);
    mutation.observe(element, { childList: true });
    element.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      resize.disconnect();
      mutation.disconnect();
      element.removeEventListener("scroll", update);
      this.element = null;
    };
  };

  get scrolls(): boolean {
    return !(this.at_start && this.at_end);
  }

  step(direction: 1 | -1): void {
    if (!this.element) return;
    this.element.scrollBy({ left: direction * this.element.clientWidth * 0.9, behavior: "smooth" });
  }
}
