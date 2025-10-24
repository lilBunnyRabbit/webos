// import { Order } from "$lib/core/utils/order";
// import { adjustWindowSize, calculateWindowPosition } from "$lib/core/utils/window";
// import { v4 as uuid } from "uuid";

// export type WindowId = string;

// export interface Position {
//   x: number;
//   y: number;
// }

// export interface Dimensions {
//   width: number;
//   height: number;
// }

// export type Bounds = Position & Dimensions;

// export interface WindowInstance {
//   id: WindowId;
//   // app: AppInstance;
//   createdAt: Date;
//   // flags: Flags<WindowFlag>;
//   // snapZone: SnapZone;
//   tmp__content: string;
//   config: {
//     position: Position;
//     size: Dimensions;
//     zIndex: number;
//   };
// }

// let maxZIndex = $state(0);
// export const index = $state<Record<WindowId, WindowInstance>>({});

// // // Order already extends SvelteMap (reactive), don't wrap in $state!
// // export const order = new Order<WindowId>();

// // todo store z-index on window

// export function openWindow(content: string) {
//   const id: WindowId = uuid();

//   const size = adjustWindowSize({ width: 600, height: 400 });
//   const instance: WindowInstance = {
//     id,
//     // flags: action.defaults?.flags ? action.defaults.flags.clone() : new Flags(),
//     createdAt: new Date(),
//     // snapZone: action.defaults?.snapZone ?? null,
//     config: {
//       size,
//       position: calculateWindowPosition(size, Object.keys(index).length),
//       zIndex: ++maxZIndex,
//     },
//     // app: action.app,
//     tmp__content: content,
//   };

//   index[id] = instance;
// }

// export function focusWindow(id: WindowId) {
//   const instance = index[id];
//   if (!instance) return;

//   instance.config.zIndex = ++maxZIndex;
// }

// export function closeWindow(id: WindowId) {
//   delete index[id];
//   if (Object.keys(index).length === 0) maxZIndex = 0;
// }

// // ---

// /**
//  * Core window operations - create, destroy, get
//  */