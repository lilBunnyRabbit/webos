export type PartialRecord<K extends PropertyKey, T> = { [P in K]?: T | undefined };

export interface Position {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export type Bounds = Position & Dimensions;
