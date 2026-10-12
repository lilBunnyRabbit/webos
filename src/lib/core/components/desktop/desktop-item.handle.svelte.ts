import type { Position } from "$lib/core/utils/type";
import kernel, { type GridDesktopService } from "$lib/core/api";
import type { Attachment } from "svelte/attachments";

const desktop = $derived(kernel.service<GridDesktopService>("desktop"));

// TODO: cleanup just ported - unify position and state

export class ItemHandler {
  private static DRAG_THRESHOLD = 8;

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
        new_position: Position;
      }
    | null
  >(null);
  public is_blocked = $derived(
    this.move_state?.type === "move" &&
      desktop.has_item_in_position({
        x: this.move_state.new_position.x,
        y: this.move_state.new_position.y,
      })
  );
  public preview_element = $state<HTMLElement | null>(null);

  constructor(private current_position: Position, private on_move: (position: Position) => void) {}

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

      if (this.preview_element) {
        this.preview_element.style.left = `${event.clientX - this.move_state.offset.x}px`;
        this.preview_element.style.top = `${event.clientY - this.move_state.offset.y}px`;
      }

      if (this.move_state.type === "start") {
        // Check if we've moved enough to start dragging
        const delta_x = Math.abs(event.clientX - this.move_state.pointer.x);
        const delta_y = Math.abs(event.clientY - this.move_state.pointer.y);

        if (delta_x < ItemHandler.DRAG_THRESHOLD && delta_y < ItemHandler.DRAG_THRESHOLD) {
          return;
        }
      }

      // Get mouse position relative to parent
      const x = event.clientX - desktop.container.bounds.x;
      const y = event.clientY - desktop.container.bounds.y;

      // Calculate new grid position based on mouse position & grid cell size (64px)
      const new_x = Math.max(
        0,
        Math.min(Math.floor(x / desktop.container.cell.width), desktop.container.grid.columns - 1)
      );
      const new_y = Math.max(
        0,
        Math.min(Math.floor(y / desktop.container.cell.height), desktop.container.grid.rows - 1)
      );

      // So that typescript is happy
      if (this.move_state.type !== "move") {
        this.move_state = {
          type: "move",
          offset: this.move_state.offset,
          pointer: this.move_state.pointer,
          new_position: {
            x: this.current_position.x,
            y: this.current_position.y,
          },
        };
      } else {
        this.move_state.new_position.x = new_x;
        this.move_state.new_position.y = new_y;
      }
    };

    const on_end = () => {
      document.removeEventListener("mousemove", on_move);
      document.removeEventListener("mouseup", on_end);

      if (!this.is_blocked && this.move_state?.type === "move") {
        this.on_move({ x: this.move_state.new_position.x, y: this.move_state.new_position.y });
      }

      this.move_state = null;
    };

    element.addEventListener("mousedown", on_down);
    return cleanup;
  }
}
