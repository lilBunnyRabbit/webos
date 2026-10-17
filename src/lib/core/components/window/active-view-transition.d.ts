// Chrome ships document.activeViewTransition, but TypeScript's DOM lib doesn't declare it yet.
interface Document {
  readonly activeViewTransition: ViewTransition | null;
}
