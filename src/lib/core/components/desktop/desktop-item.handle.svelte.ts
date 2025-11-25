import type { Position } from "$lib/core/utils/type";
import kernel, { type DesktopService } from "$lib/core/api";
import type { Attachment } from "svelte/attachments";

const desktop = $derived(kernel.service<DesktopService>("desktop"));

// TODO: cleanup just ported - unify position and state

export class ItemHandler {
  public move_position = $state<{ column: number; row: number } | null>(null);
  public move_state = $state<
    | {
        type: "start";
        offset: Position;
        pointer: Position;
      }
    | {
        type: "move";
        offset: Position;
        pointer: Position;
      }
    | null
  >(null);
  public is_blocked = $derived.by(() => {
    if (!this.move_state || this.move_state.type !== "move" || !this.move_position) return false;
    return desktop.has_item_in_position({
      x: this.move_position.column - 1,
      y: this.move_position.row - 1,
    });
  });
  public preview_element = $state<HTMLElement | null>(null);

  constructor(private on_move: (position: Position) => void) {}

  public drag_attachment(element: HTMLElement) {
    const cleanup = () => {
      element.removeEventListener("mousedown", on_down);
      document.removeEventListener("mousemove", on_move);
      document.removeEventListener("mouseup", on_end);
    };

    const on_down = (event: MouseEvent) => {
      const rect = element.getBoundingClientRect();

      let offset = {
        x: 0,
        y: 0,
      };

      if (rect) {
        offset = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      }

      this.move_state = {
        type: "start",
        offset,
        pointer: {
          x: event.clientX,
          y: event.clientY,
        },
      };

      document.addEventListener("mousemove", on_move);
      document.addEventListener("mouseup", on_end);
    };

    const on_move = (event: MouseEvent) => {
      if (!this.move_state) return;

      if (this.move_state.type === "start") {
        // Check if we've moved enough to start dragging
        const deltaX = Math.abs(event.clientX - this.move_state.pointer.x);
        const deltaY = Math.abs(event.clientY - this.move_state.pointer.y);
        const dragThreshold = 8; // pixels

        if (deltaX < dragThreshold && deltaY < dragThreshold) {
          return;
        }

        this.move_state = {
          type: "move",
          offset: this.move_state.offset,
          pointer: this.move_state.pointer,
        };
      }

      // Get mouse position relative to parent
      const x = event.clientX - desktop.container.bounds.x;
      const y = event.clientY - desktop.container.bounds.y;

      if (this.preview_element) {
        this.preview_element.style.left = `${event.clientX - this.move_state.offset.x}px`;
        this.preview_element.style.top = `${event.clientY - this.move_state.offset.y}px`;
      }

      // Calculate new grid position based on mouse position & grid cell size (64px)
      const newGridX = Math.max(
        0,
        Math.min(Math.floor(x / desktop.container.cell.width), desktop.container.grid.columns - 1)
      );
      const newGridY = Math.max(
        0,
        Math.min(Math.floor(y / desktop.container.cell.height), desktop.container.grid.rows - 1)
      );
      this.move_position = {
        column: newGridX + 1,
        row: newGridY + 1,
      };
    };

    const on_end = () => {
      console.log("on_end", this.move_state, this.move_position, this.is_blocked);

      document.removeEventListener("mousemove", on_move);
      document.removeEventListener("mouseup", on_end);

      if (!this.is_blocked && this.move_position && this.move_state?.type === "move") {
        this.on_move({ x: this.move_position.column - 1, y: this.move_position.row - 1 });
      }

      this.move_state = null;
      this.move_position = null;
    };

    element.addEventListener("mousedown", on_down);
    return cleanup;
  }
}
