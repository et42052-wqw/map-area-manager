export type Point = [number, number]; // [longitude, latitude]
export interface Area {
  id: string;
  name: string;
  color: string;
  description: string;
  points: Point[];
  createdAt: number;
}
export interface SearchResult {
  address: string;
  x: number;
  y: number;
}
