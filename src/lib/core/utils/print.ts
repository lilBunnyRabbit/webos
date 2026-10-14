export interface PrintOptions {
  /** The document title, which browsers suggest as the PDF file name. */
  title?: string;
}

/**
 * Prints an HTML document on its own, not the OS around it. The frame allows same-origin access so the page can call
 * its `print()`, and no scripts, so app-generated HTML (rendered Markdown) can't run anything.
 */
export function print_html(html: string, options: PrintOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-same-origin allow-modals");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;inset-inline-start:-10000px;width:0;height:0;border:0";

    const cleanup = () => {
      frame.remove();
      resolve();
    };

    frame.onload = () => {
      const target = frame.contentWindow;
      if (!target) {
        frame.remove();
        reject(new Error("Couldn't open the print frame"));
        return;
      }
      if (options.title) target.document.title = options.title;
      target.addEventListener("afterprint", cleanup, { once: true });
      target.focus();
      target.print();
    };
    frame.srcdoc = html;
    document.body.append(frame);
  });
}
