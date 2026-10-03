// Shared types of the «Дизайн-проект» generator. All geometry is in metres:
// x to the right, y down the drawing (north is up), origin at the outer
// top-left corner of the building or the plot.

export type DesignObject = 'house' | 'banya' | 'garage' | 'flat' | 'landscape';
export type DesignStyle = 'scandi' | 'loft' | 'modern' | 'classic' | 'eco' | 'minimal';
export type Budget = 'econom' | 'mid' | 'premium';

export interface DesignParams {
  object: DesignObject;
  /** Building: the long side. Landscape: the plot depth from the street. */
  length: number;
  /** Building: the short side. Landscape: the street frontage. */
  width: number;
  floors: number;
  /** House: bedrooms; flat: living rooms (0 — one open space); garage: cars. */
  rooms: number;
  style: DesignStyle;
  budget: Budget;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RoomKind =
  | 'living'
  | 'bedroom'
  | 'kids'
  | 'cabinet'
  | 'bath'
  | 'wc'
  | 'hall'
  | 'stair'
  | 'storage'
  | 'boiler'
  | 'wardrobe'
  | 'steam'
  | 'wash'
  | 'rest'
  | 'vestibule'
  | 'garage'
  | 'workshop'
  | 'studio';

export interface Zone {
  name: string;
  rect: Rect;
}

export interface Room {
  id: string;
  kind: RoomKind;
  name: string;
  /** The planning cell, on the axes of the partitions. */
  cell: Rect;
  /** The clear room inside the partitions. */
  clear: Rect;
  /** Clear floor area, м², one decimal. */
  area: number;
  wet: boolean;
  /** Furniture zones inside an open space (dashed on the plan). */
  zones: Zone[];
}

export type Axis = 'x' | 'y';

export interface Door {
  /** Centre of the opening on the wall's axis line. */
  x: number;
  y: number;
  /** Direction the wall runs in. */
  axis: Axis;
  width: number;
  /** Side the leaf swings to, across the wall: +1 — towards +y (or +x). */
  swing: 1 | -1;
  /** Hinge at the low-coordinate jamb (true) or the high one. */
  hingeLow: boolean;
  kind: 'door' | 'entrance' | 'gate' | 'opening';
  /** Room ids on both sides; null — outside. */
  rooms: [string, string | null];
}

export interface Win {
  x: number;
  y: number;
  axis: Axis;
  width: number;
  height: number;
  room: string;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FloorPlan {
  index: number;
  label: string;
  rooms: Room[];
  doors: Door[];
  windows: Win[];
  /** Partition axis lines, each once. */
  partitions: Segment[];
}

export type Roof = 'gable' | 'hip' | 'flat' | 'barrel';

export interface Building {
  L: number;
  W: number;
  /** Outer wall thickness. */
  ext: number;
  /** Partition thickness. */
  part: number;
  /** Clear ceiling height. */
  ceiling: number;
  roof: Roof;
  floors: FloorPlan[];
  notes: string[];
}

export type LandZoneKind =
  | 'house'
  | 'terrace'
  | 'driveway'
  | 'parking'
  | 'path'
  | 'beds'
  | 'playground'
  | 'bbq'
  | 'flowers'
  | 'garden'
  | 'lawn';

export interface LandZone {
  kind: LandZoneKind;
  name: string;
  rect: Rect;
  area: number;
}

export interface Landscape {
  /** Frontage along the street (x). */
  W: number;
  /** Depth from the street (y); the street is at y = L. */
  L: number;
  zones: LandZone[];
  /** Fruit trees, centre points. */
  trees: { x: number; y: number }[];
  /** Garden beds inside the beds zone. */
  beds: Rect[];
  gate: { x: number; width: number };
  wicket: { x: number; width: number };
  /** Lawn to sow, м², including the lawn under the fruit trees. */
  lawn: number;
  /** Open lawn outside every zone, м². */
  openLawn: number;
  notes: string[];
}
