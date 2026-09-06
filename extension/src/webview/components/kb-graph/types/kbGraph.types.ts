export interface LegendItem {
  type: string;
  count: number;
  color: string;
}

export interface LegendWindowState {
  x: number;
  y: number;
  w: number;
  h: number;
  maximized: boolean;
  minimized: boolean;
}

export interface LegendWindowProps {
  items: LegendItem[];
  isMaximized?: boolean;
  position?: { x: number; y: number };
  size?: { w: number; h: number };
}

export interface MinimapState {
  isRotated: boolean;
  scale: number;
  viewport: { x: number; y: number; w: number; h: number };
  spanMode: boolean;
}

export interface FilterState {
  query: string;
  selectedTypes: string[];
  wildcardEnabled: boolean;
}
