import { $insertNodeToNearestRoot, mergeRegister } from "@lexical/utils";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
import {
  $create,
  $createNodeSelection,
  $getDocument,
  $getNodeByKey,
  $getNodeFromDOMNode,
  $getSelection,
  $getState,
  $isNodeSelection,
  $setSelection,
  $setState,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  createState,
  DecoratorNode,
  defineExtension,
  isDOMNode,
  safeCast,
  type DOMConversionOutput,
  type DOMExportOutput,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { IMAGE, IMAGE_WIDTH, image_align, image_width, safe_image, type ImageAlign } from "./model";

const src_state = createState("src", { parse: (value) => (typeof value === "string" ? value : "") });
const width_state = createState("width", { parse: (value) => image_width(value ?? IMAGE_WIDTH.DEFAULT) });
const align_state = createState("align", { parse: (value) => image_align(value) });
const alt_state = createState("alt", { parse: (value) => (typeof value === "string" ? value : "") });

export interface ImageProps {
  src: string;
  width: number;
  align: ImageAlign;
  alt: string;
}

export const IMAGE_CLASS = "wr-image";

function paint(element: HTMLElement, props: ImageProps) {
  const frame = element.firstElementChild as HTMLElement;
  const image = frame.firstElementChild as HTMLImageElement;
  element.dataset.align = props.align;
  frame.style.width = `${props.width}%`;
  if (image.getAttribute("src") !== props.src) image.src = props.src;
  image.alt = props.alt;
}

// Dragged by its handle on a mouse or pen; touch uses the width presets, so the picture never steals a scroll.
function attach_resize(element: HTMLElement, handle: HTMLElement, key: NodeKey, editor: LexicalEditor) {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const frame = element.firstElementChild as HTMLElement;
    const box = element.getBoundingClientRect();
    const start = frame.getBoundingClientRect();
    let width = Number.parseFloat(frame.style.width) || IMAGE_WIDTH.DEFAULT;
    const move = (moved: PointerEvent) => {
      const align = element.dataset.align;
      const span = align === "right" ? start.right - moved.clientX : align === "center" ? 2 * (moved.clientX - (box.left + box.width / 2)) : moved.clientX - start.left;
      width = image_width((span / box.width) * 100);
      frame.style.width = `${width}%`;
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      editor.update(() => {
        const node = $getNodeByKey(key);
        if ($is_image(node)) node.set_width(width);
      });
    };
    handle.setPointerCapture(event.pointerId);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("lostpointercapture", end, { once: true });
  });
}

function $convert_image(element: HTMLElement): DOMConversionOutput {
  const src = safe_image(element.getAttribute("src") ?? undefined);
  if (!src) return { node: null };
  const node = $create_image({ src, alt: element.getAttribute("alt") ?? "" });
  const width = Number.parseFloat(element.style.width);
  if (element.style.width.endsWith("%") && Number.isFinite(width)) node.set_width(width);
  const align = element.dataset.align;
  if (align) node.set_align(image_align(align));
  return { node };
}

export class ImageNode extends DecoratorNode<null> {
  $config() {
    return this.config(IMAGE, {
      extends: DecoratorNode,
      stateConfigs: [
        { stateConfig: src_state, flat: true },
        { stateConfig: width_state, flat: true },
        { stateConfig: align_state, flat: true },
        { stateConfig: alt_state, flat: true },
      ],
      importDOM: { img: () => ({ conversion: $convert_image, priority: 0 }) },
    });
  }

  props(): ImageProps {
    return { src: $getState(this, src_state), width: $getState(this, width_state), align: $getState(this, align_state), alt: $getState(this, alt_state) };
  }

  set_src(src: string): this {
    return $setState(this, src_state, src);
  }

  set_width(width: number): this {
    return $setState(this, width_state, image_width(width));
  }

  set_align(align: ImageAlign): this {
    return $setState(this, align_state, align);
  }

  set_alt(alt: string): this {
    return $setState(this, alt_state, alt);
  }

  createDOM(_config: unknown, editor: LexicalEditor): HTMLElement {
    const document = $getDocument();
    const element = document.createElement("div");
    element.className = IMAGE_CLASS;
    element.contentEditable = "false";
    const frame = document.createElement("span");
    frame.className = "wr-image-frame";
    const image = document.createElement("img");
    image.draggable = false;
    const handle = document.createElement("span");
    handle.className = "wr-image-handle";
    handle.setAttribute("aria-hidden", "true");
    frame.append(image, handle);
    element.append(frame);
    paint(element, this.props());
    attach_resize(element, handle, this.getKey(), editor);
    return element;
  }

  updateDOM(_previous: unknown, element: HTMLElement): boolean {
    paint(element, this.props());
    return false;
  }

  exportDOM(): DOMExportOutput {
    const { src, width, align, alt } = this.props();
    const image = $getDocument().createElement("img");
    image.src = src;
    image.alt = alt;
    image.style.width = `${width}%`;
    image.dataset.align = align;
    return { element: image };
  }

  getTextContent(): string {
    return "\n";
  }

  isInline(): false {
    return false;
  }

  decorate(): null {
    return null;
  }
}

export function $create_image(props: Partial<ImageProps> & { src: string }): ImageNode {
  const node = $create(ImageNode).set_src(props.src);
  if (props.width !== undefined) node.set_width(props.width);
  if (props.align) node.set_align(props.align);
  if (props.alt) node.set_alt(props.alt);
  return node;
}

export function $is_image(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode;
}

export function $insert_image(props: Partial<ImageProps> & { src: string }): ImageNode {
  const node = $create_image(props);
  $insertNodeToNearestRoot(node);
  return node;
}

export function $selected_image(): ImageNode | null {
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) return null;
  const nodes = selection.getNodes();
  return nodes.length === 1 && $is_image(nodes[0]) ? nodes[0] : null;
}

export interface ImageConfig {
  on_files: (editor: LexicalEditor, files: File[]) => boolean;
}

export const ImageExtension = defineExtension({
  name: "@webos/warren/Image",
  nodes: () => [ImageNode],
  config: safeCast<ImageConfig>({ on_files: () => false }),
  register: (editor, config) => {
    let painted = new Set<NodeKey>();
    return mergeRegister(
      editor.registerCommand(
        CLICK_COMMAND,
        (event) => {
          if (!isDOMNode(event.target)) return false;
          const node = $getNodeFromDOMNode(event.target.parentElement?.closest(`.${IMAGE_CLASS}`) ?? event.target);
          if (!$is_image(node)) return false;
          const selection = $createNodeSelection();
          selection.add(node.getKey());
          $setSelection(selection);
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        DRAG_DROP_PASTE,
        (files) => {
          const pictures = files.filter((file) => file.type.startsWith("image/"));
          return pictures.length > 0 && config.on_files(editor, pictures);
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerUpdateListener(({ editorState }) => {
        const selected = editorState.read(() => {
          const selection = $getSelection();
          return new Set($isNodeSelection(selection) ? selection.getNodes().filter($is_image).map((node) => node.getKey()) : []);
        });
        for (const key of painted) if (!selected.has(key)) editor.getElementByKey(key)?.classList.remove("selected");
        for (const key of selected) editor.getElementByKey(key)?.classList.add("selected");
        painted = selected;
      })
    );
  },
});
