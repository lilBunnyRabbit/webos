import type { Dimensions, Position, SnapZone } from "@/core/contexts/window-manager";
import React from "react";

export interface WindowContextProps {
  position: Position;
  setPosition: React.Dispatch<React.SetStateAction<Position>>;
  size: Dimensions;
  setSize: React.Dispatch<React.SetStateAction<Dimensions>>;
  snapZone: SnapZone;
  setSnapZone: React.Dispatch<React.SetStateAction<SnapZone>>;
  toSnapZone: (snapZone: SnapZone) => void;
}

export const WindowContext = React.createContext<WindowContextProps | null>(null);

export interface WindowToolbarContextProps {
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
}

export const WindowToolbarContext = React.createContext<WindowToolbarContextProps | null>(null);
