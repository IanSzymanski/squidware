import { id, number, object, string } from './projectValidation';

export const CAMERA_VIEW_LIMITS = { count: 32, name: 60, coordinate: 4096, minFov: 15, maxFov: 95 } as const;

export interface CameraView {
  projection: 'perspective';
  fov: number;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

export interface SavedCameraView extends CameraView {
  id: string;
  name: string;
}

export function validateCameraViews(value: unknown): SavedCameraView[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > CAMERA_VIEW_LIMITS.count) {
    throw new Error(`Saved cameras must contain at most ${CAMERA_VIEW_LIMITS.count} views.`);
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  const { coordinate, minFov, maxFov } = CAMERA_VIEW_LIMITS;
  const vector = (value: unknown, label: string): CameraView['position'] => {
    if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must have three coordinates.`);
    return [number(value[0], label, -coordinate, coordinate), number(value[1], label, -coordinate, coordinate), number(value[2], label, -coordinate, coordinate)];
  };
  const views = value.map((entry, index): SavedCameraView => {
    const label = `Saved camera ${index + 1}`;
    const data = object(entry, label);
    const viewId = id(data.id, `${label} ID`);
    const name = string(data.name, `${label} name`, CAMERA_VIEW_LIMITS.name).trim();
    const nameKey = name.toLowerCase();
    if (ids.has(viewId) || names.has(nameKey)) throw new Error('Give each saved camera a unique name and ID.');
    ids.add(viewId);
    names.add(nameKey);
    if (data.projection !== 'perspective') throw new Error(`${label} has an unsupported projection.`);
    const position = vector(data.position, `${label} position`);
    const target = vector(data.target, `${label} target`);
    if (Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]) < 1) {
      throw new Error(`${label} must be at least one yard from its target.`);
    }
    return { id: viewId, name, projection: data.projection, position, target, fov: number(data.fov, `${label} field of view`, minFov, maxFov) };
  });
  return views.length ? views : undefined;
}
