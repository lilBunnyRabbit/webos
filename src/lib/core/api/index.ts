import { Kernel } from "./kernel";

export * from "./kernel";
export * from "./services";
export * from "./type";

const kernel = new Kernel();

// TODO: define
(window as unknown as { kernel: Kernel }).kernel = kernel;

export default kernel;
