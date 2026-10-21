import { create_notebook, create_proposal, add_proposal, type Notebook } from "./model";

export function starter_notebook(): Notebook {
  return add_proposal(create_notebook(), create_proposal());
}

export class NotebookDocument {
  notebook = $state.raw<Notebook>(starter_notebook());
  private saved = $state.raw<Notebook | null>(null);

  constructor() {
    this.saved = this.notebook;
  }

  readonly dirty = $derived(this.notebook !== this.saved);

  load(notebook: Notebook, saved: boolean) {
    this.notebook = notebook;
    this.saved = saved ? notebook : null;
  }

  mark_saved(notebook: Notebook) {
    this.saved = notebook;
  }

  apply(change: (notebook: Notebook) => Notebook) {
    this.notebook = change(this.notebook);
  }
}
