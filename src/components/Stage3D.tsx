import { isCustomSurface, surfaceReferences, type Surface } from '../surfaces';
import { compileChoreography, neutralCuePose, sampleChoreography, type ChoreographySample } from '../choreography';
import { resolveEquipment, type CarriedEquipment } from '../equipment';
import { AssetBatches, AssetResources } from './3d/assetBatches';
import { carriedModels, flagGrip, flagHolderParts, flagPoleParts, type AssetPlacement } from './3d/assetModels';
import { stagingPlacements } from './3d/stagingModels';
import type { StagingSample } from '../staging';
import { facingAt } from '../performerFacing';
import { HelpButton } from '../editor/ControlHelp';
import { Tooltip } from './Tooltip';
import { selectionMembership } from '../selection';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Camera } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PerformerAppearance, PerformerFacings, Point, Project, TimelineSample } from '../types';
import { createDemandFrames } from './demandFrames';
import { sampleCueLegPose, sampleLegPose, type LegMotionFrame, type LegPose } from './legMotion';
import { LegMotionMeshes } from './legMotionMeshes';
import type { CameraView, SavedCameraView } from '../cameraViews';
import { CameraViewsPanel, type CameraLibrary } from './CameraViewsPanel';
import './stages.css';

export type Stage3DQuality = 'detailed' | 'lightweight';
export interface Stage3DProps {
  project: Project;
  positions: Record<string, Point>;
  facings?: PerformerFacings;
  staging?: readonly StagingSample[];
  selectedIds: string[];
  /** Omitted in the read-only 3D window: clicks orbit the camera but never change selection. */
  onSelect?: (ids: string[]) => void;
  quality: Stage3DQuality;
  onQualityChange: (quality: Stage3DQuality) => void;
  onReturnTo2D: () => void;
  cameraRequest?: { preset: CameraPreset | null; version: number };
  onCameraPreset?: (preset: CameraPreset | null) => void;
  hideCameraPresets?: boolean;
  splitReview?: boolean;
  cameraLibrary?: CameraLibrary;
  activeCamera?: SavedCameraView;
  capture?: StageCapture;
  /** A host without its own 2D field (the 3D window) supplies the interruption text and recovery actions. */
  recovery?: { contextLost: string; unavailable?: string; actions: ReactNode };
  /** Tooling can supply a fixed review angle, cue samples, or stationary fixture equipment. */
  previewCamera?: PreviewCamera;
  legMotion?: LegMotionFrame;
  cueTiming?: Pick<TimelineSample, 'setIndex' | 'localCount'>;
  assetReview?: { showEquipment: boolean; pit: readonly AssetPlacement[]; onFrame: (stats: RenderStats) => void };
}

export interface StageCapture {
  width: number;
  height: number;
  camera?: CameraView;
  ready: (draw: (sample: TimelineSample, destination: CanvasRenderingContext2D) => void) => void;
  failed: (error: Error) => void;
}

export type CameraPreset = 'perspective' | 'front' | 'press-box' | 'top';
export interface PreviewCamera {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}
export interface RenderStats { calls: number; triangles: number; geometries: number }
interface SceneState {
  scene: THREE.Scene;
  capacity: number;
  roster: string;
  performers: { id: string; color: string; appearance?: PerformerAppearance; role?: PerformerAppearance['role']; equipment?: CarriedEquipment }[];
  carried: AssetBatches;
  staging: AssetBatches;
  pit: AssetBatches;
  /** 1 in tooling that inspects models at true size; the editor draws the cast slightly larger than life. */
  castScale: number;
  bodies: THREE.InstancedMesh;
  heads: THREE.InstancedMesh;
  caps: THREE.InstancedMesh;
  legs: THREE.InstancedMesh;
  legMotion?: LegMotionMeshes;
  shadows: THREE.InstancedMesh;
  rings: THREE.InstancedMesh;
  headings: THREE.InstancedMesh;
  roleMarkers: THREE.InstancedMesh;
  setCamera: (preset: CameraPreset) => void;
  setPreviewCamera: (camera: PreviewCamera) => void;
  readCamera: () => CameraView;
  restoreCamera: (camera: CameraView) => void;
  drawFrame: Parameters<StageCapture['ready']>[0];
  setQuality: (quality: Stage3DQuality) => void;
  setFieldSurface: (surface: Surface, background?: HTMLImageElement) => void;
  setStadium: (visible: boolean) => void;
  invalidate: () => void;
  fail: (cause: unknown) => void;
}

const meshKeys = ['bodies', 'heads', 'caps', 'legs', 'shadows', 'rings', 'headings', 'roleMarkers'] as const;
const performerCapacity = (count: number) => Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(count, 1))));
const rad = THREE.MathUtils.degToRad;

/** The editor draws the cast a little larger than life so forms read from the press box, the way a 2D dot is wider than a marcher. */
const CAST_SCALE = 1.25;
/** Height of the playing surface. Figures, props and equipment are modeled from 0 and stand just into it. */
const TURF_Y = 0.048;
const PRESET_FOV = 36;
/** Figures stand in directional light, so their sides sit below full exposure; the lift keeps a section as vivid as its 2D dot. */
const castColor = (color: string) => new THREE.Color(color).multiplyScalar(1.3);

interface Insets { top: number; right: number; bottom: number; left: number }

/**
 * Viewing angles of a camera preset. A field seen from the side is a wide, shallow band, so narrower panes
 * look down more steeply to keep filling their height, and so does a field with no stadium behind it.
 */
function presetAngles(preset: CameraPreset, aspect: number, open: boolean) {
  const steeper = THREE.MathUtils.clamp(1.9 - aspect, 0, 1) + (open ? .55 : 0);
  if (preset === 'top') return { azimuth: 0, elevation: Math.PI / 2 - 1e-4 };
  if (preset === 'front') return { azimuth: 0, elevation: rad(20 + 5 * steeper) };
  if (preset === 'press-box') return { azimuth: 0, elevation: rad(36 + 14 * steeper) };
  return { azimuth: rad(22), elevation: rad(33 + 12 * steeper) };
}

/**
 * Place a camera that looks along a fixed direction so `subject` exactly fills the pane inside `insets`
 * (fractions of the pane kept clear for overlays). Each frustum side bounds the distance in closed form;
 * the camera then slides sideways and vertically until opposite sides have equal room on screen.
 * `backdrop` never changes the distance: it only joins the vertical balance, within the room the subject leaves.
 */
function fitView(azimuth: number, elevation: number, fov: number, aspect: number, insets: Insets, subject: readonly THREE.Vector3[], backdrop: readonly THREE.Vector3[]) {
  const forward = new THREE.Vector3(-Math.sin(azimuth) * Math.cos(elevation), -Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
  const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward);
  const vertical = Math.tan(rad(fov) / 2), horizontal = vertical * aspect;
  const top = vertical * (1 - 2 * insets.top), bottom = vertical * (1 - 2 * insets.bottom);
  const east = horizontal * (1 - 2 * insets.right), west = horizontal * (1 - 2 * insets.left);
  const bounds = (points: readonly THREE.Vector3[]) => {
    const edge = { top: -Infinity, bottom: -Infinity, east: -Infinity, west: -Infinity };
    for (const point of points) {
      const x = point.dot(right), y = point.dot(up), z = point.dot(forward);
      edge.top = Math.max(edge.top, y / top - z);
      edge.bottom = Math.max(edge.bottom, -y / bottom - z);
      edge.east = Math.max(edge.east, x / east - z);
      edge.west = Math.max(edge.west, -x / west - z);
    }
    return edge;
  };
  const fit = bounds(subject);
  const distance = Math.max((fit.top * top + fit.bottom * bottom) / (top + bottom), (fit.east * east + fit.west * west) / (east + west));
  // Points sit at different depths, so equal room on both sides has no closed form; the difference is monotonic and bisects.
  const balance = (points: readonly THREE.Vector3[], axis: THREE.Vector3, ahead: number, behind: number, low: number, high: number) => {
    const lean = (offset: number) => {
      let before = Infinity, after = Infinity;
      for (const point of points) {
        const slope = (point.dot(axis) - offset) / (point.dot(forward) + distance);
        before = Math.min(before, ahead - slope);
        after = Math.min(after, behind + slope);
      }
      return before - after;
    };
    if (lean(low) >= 0) return low;
    if (lean(high) <= 0) return high;
    for (let step = 0; step < 30; step++) {
      const middle = (low + high) / 2;
      if (lean(middle) < 0) low = middle; else high = middle;
    }
    return (low + high) / 2;
  };
  const lift = balance([...subject, ...backdrop], up, top, bottom, top * (fit.top - distance), bottom * (distance - fit.bottom));
  const shift = balance(subject, right, east, west, east * (fit.east - distance), west * (distance - fit.west));
  const position = right.multiplyScalar(shift).addScaledVector(up, lift).addScaledVector(forward, -distance);
  // Orbit around the point on the turf at the center of the view.
  const reach = position.y / -forward.y;
  return { position, target: position.clone().addScaledVector(forward, reach), reach };
}

/** Color a part, optionally shading it toward its base, so parts of one figure or building merge into a single mesh. */
function paint<T extends THREE.BufferGeometry>(geometry: T, color: THREE.ColorRepresentation, gain = 1, base = 1): T {
  const { r, g, b } = new THREE.Color(color);
  const position = geometry.attributes.position;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    const level = max.y > min.y ? (position.getY(index) - min.y) / (max.y - min.y) : 1;
    const shade = gain * (base + (1 - base) * level);
    colors.set([r * shade, g * shade, b * shade], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function merged(parts: THREE.BufferGeometry[]) {
  const geometry = mergeGeometries(parts);
  if (!geometry) throw new Error('The 3D scene geometry could not be built.');
  parts.forEach(part => part.dispose());
  return geometry;
}

const block = (x: number, y: number, z: number, width: number, height: number, depth: number, color: THREE.ColorRepresentation, gain = 1) =>
  paint(new THREE.BoxGeometry(width, height, depth).translate(x, y, z), color, gain);

/**
 * A stylized marcher in four instanced parts: jacket and shako take the section color, trim stays neutral.
 * Everything that tells front from back sits on +Z: chest panel, visor, badge, plume and shoes.
 * Proportions keep the shoulder and hand heights the carried equipment models were built around.
 */
function figureGeometries() {
  const trim = '#f3f0e6', lit = 1.4;
  // A tube closed only where a camera can see into it: every part's underside is hidden by the part below.
  const capped = (top: number, bottom: number, height: number, squash = 1) => [
    new THREE.CylinderGeometry(top, bottom, height, 8, 1, true).scale(1, 1, squash),
    new THREE.CircleGeometry(top, 8).rotateX(-Math.PI / 2).scale(1, 1, squash).translate(0, height / 2, 0),
  ];
  const jacket = merged([
    ...capped(.25, .19, .8, .7).map((part, index) => paint(part.translate(0, .96, 0), '#ffffff', 1, index ? 1 : .72)),
    ...[-1, 1].map(side => paint(new THREE.CylinderGeometry(.072, .058, .62, 4).rotateX(-.1).rotateZ(side * .06).translate(side * .305, 1, .03), '#ffffff', 1, .8)),
  ]);
  const head = merged([
    paint(new THREE.SphereGeometry(.155, 8, 5).translate(0, 1.525, 0), '#e2cfb4'),
    // Upright trim is lifted so it still reads white where the light only grazes it.
    paint(new THREE.PlaneGeometry(.17, .5).rotateX(.052).translate(0, 1.04, .167), trim, lit),
    paint(new THREE.SphereGeometry(1, 4, 2).scale(.06, .18, .06).translate(0, 2.07, .03), trim, lit),
    paint(new THREE.PlaneGeometry(.1, .1).translate(0, 1.76, .163), trim, lit),
  ]);
  const shako = merged([
    ...capped(.15, .168, .3).map((part, index) => paint(part.translate(0, 1.76, 0), '#ffffff', 1, index ? 1 : .8)),
    paint(new THREE.BoxGeometry(.27, .035, .17).translate(0, 1.625, .17), '#ffffff', .3),
  ]);
  // Trousers and shoes match the articulated legs that replace them during choreography.
  const leg = merged([
    paint(new THREE.CylinderGeometry(.08, .07, .56, 5, 1, true).translate(0, .34, 0), '#455450'),
    paint(new THREE.BoxGeometry(.125, .09, .25).translate(0, .075, .05), '#b9c9c1'),
  ]);
  return { jacket, head, shako, leg };
}

/** A soft disc under each figure grounds it when Lightweight quality turns the sun's shadows off. */
function makeContactShadow(owner: Document) {
  const canvas = owner.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The shadow texture could not be created.');
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(0,0,0,.5)');
  gradient.addColorStop(.5, 'rgba(0,0,0,.26)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** The floor is a pool of light that falls off to the pane's own color, so the scene has no horizon or edge. */
function paintFloor(canvas: HTMLCanvasElement, glow: string, well: string) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The floor texture could not be created.');
  const half = canvas.width / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, glow);
  gradient.addColorStop(.42, glow);
  gradient.addColorStop(.86, well);
  gradient.addColorStop(1, well);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

function roundedRect(halfLength: number, halfDepth: number, radius: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfLength + radius, -halfDepth);
  shape.lineTo(halfLength - radius, -halfDepth);
  shape.absarc(halfLength - radius, -halfDepth + radius, radius, -Math.PI / 2, 0, false);
  shape.lineTo(halfLength, halfDepth - radius);
  shape.absarc(halfLength - radius, halfDepth - radius, radius, 0, Math.PI / 2, false);
  shape.lineTo(-halfLength + radius, halfDepth);
  shape.absarc(-halfLength + radius, halfDepth - radius, radius, Math.PI / 2, Math.PI, false);
  shape.lineTo(-halfLength, -halfDepth + radius);
  shape.absarc(-halfLength + radius, -halfDepth + radius, radius, Math.PI, Math.PI * 1.5, false);
  return shape;
}

/** Flat ground around the field. The field's own rectangle is cut out, so no surface ever lies under the turf to fight it for depth. */
function groundAround(outline: THREE.Shape, cutout: THREE.Path) {
  outline.holes.push(cutout);
  return new THREE.ShapeGeometry(outline, 16).rotateX(-Math.PI / 2);
}
const fieldCutout = (halfWidth: number, halfDepth: number) => new THREE.Path([
  new THREE.Vector2(-halfWidth, -halfDepth), new THREE.Vector2(-halfWidth, halfDepth), new THREE.Vector2(halfWidth, halfDepth), new THREE.Vector2(halfWidth, -halfDepth),
]);

function ovalPath(context: CanvasRenderingContext2D, halfLength: number, halfDepth: number, radius = halfDepth) {
  context.beginPath();
  context.moveTo(-halfLength + radius, -halfDepth);
  context.arcTo(halfLength, -halfDepth, halfLength, halfDepth, radius);
  context.arcTo(halfLength, halfDepth, -halfLength, halfDepth, radius);
  context.arcTo(-halfLength, halfDepth, -halfLength, -halfDepth, radius);
  context.arcTo(-halfLength, -halfDepth, halfLength, -halfDepth, radius);
  context.closePath();
}

/**
 * A stylized stadium in two draw calls: a painted ground plan (sideline turf, end zones and track) with the
 * field's rectangle cut out of it, and one merged mesh for the stands and press box.
 * The home side stays low and open at the 50; a stand the camera drops behind fades out (see the cutaway in the scene).
 */
function buildStadium(width: number, depth: number, owner: Document, anisotropy: number) {
  const halfWidth = width / 2, halfDepth = depth / 2;
  const sideline = 6, lanes = 6, lane = 1.2, track = lanes * lane, endZone = 10, curb = .45;
  const innerDepth = halfDepth + sideline;
  const innerLength = halfWidth + endZone - Math.sqrt(innerDepth ** 2 - halfDepth ** 2) + 1.6 + innerDepth;
  const outerDepth = innerDepth + track, outerLength = innerLength + track;
  const planLength = outerLength + curb, planDepth = outerDepth + curb;

  const canvas = owner.createElement('canvas');
  const resolution = 2048 / (planLength * 2);
  canvas.width = 2048;
  canvas.height = Math.round(planDepth * 2 * resolution);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The stadium texture could not be created.');
  context.scale(resolution, resolution);
  context.translate(planLength, planDepth);
  context.fillStyle = '#5a6670';
  context.fillRect(-planLength, -planDepth, planLength * 2, planDepth * 2);
  ovalPath(context, outerLength, outerDepth);
  context.fillStyle = '#323a42';
  context.fill();
  context.strokeStyle = 'rgba(220,229,237,.4)';
  context.lineWidth = .12;
  for (let line = 1; line < lanes; line++) {
    ovalPath(context, innerLength + line * lane, innerDepth + line * lane);
    context.stroke();
  }
  // Finish line on the home straight.
  context.lineWidth = .22;
  context.beginPath();
  context.moveTo(halfWidth * .62, innerDepth);
  context.lineTo(halfWidth * .62, outerDepth);
  context.stroke();
  ovalPath(context, innerLength + .3, innerDepth + .3);
  context.fillStyle = '#5a6670';
  context.fill();
  ovalPath(context, innerLength, innerDepth);
  context.fillStyle = '#20352c';
  context.fill();
  context.fillStyle = '#273a34';
  context.fillRect(-halfWidth - endZone - 2.2, -halfDepth - 2.2, width + endZone * 2 + 4.4, depth + 4.4);
  for (const side of [-1, 1]) {
    const x = side > 0 ? halfWidth : -halfWidth - endZone;
    context.fillStyle = '#1f342a';
    context.fillRect(x, -halfDepth, endZone, depth);
    context.save();
    context.beginPath();
    context.rect(x, -halfDepth, endZone, depth);
    context.clip();
    context.strokeStyle = 'rgba(204,220,201,.1)';
    context.lineWidth = .5;
    context.beginPath();
    for (let offset = -depth; offset < endZone + depth; offset += 2.5) {
      context.moveTo(x + offset, halfDepth);
      context.lineTo(x + offset + depth, -halfDepth);
    }
    context.stroke();
    context.restore();
  }
  context.strokeStyle = 'rgba(204,220,201,.5)';
  context.lineWidth = .27;
  context.strokeRect(-halfWidth - endZone, -halfDepth, width + endZone * 2, depth);
  const plan = new THREE.CanvasTexture(canvas);
  plan.colorSpace = THREE.SRGBColorSpace;
  plan.anisotropy = anisotropy;
  const ground = groundAround(roundedRect(planLength, planDepth, planDepth), fieldCutout(halfWidth, halfDepth));
  const uv = ground.attributes.uv, at = ground.attributes.position;
  for (let index = 0; index < uv.count; index++) uv.setXY(index, (at.getX(index) + planLength) / (planLength * 2), 1 - (at.getZ(index) + planDepth) / (planDepth * 2));
  const base = new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ map: plan, roughness: 1 }));
  base.position.y = TURF_Y;
  base.receiveShadow = true;

  let parts: THREE.BufferGeometry[] = [];
  const riser = '#272e36', seat = '#566370', rail = '#74828f', shell = '#1e242a';
  const standZ = planDepth + 2.2, tread = .95, rise = .52, wall = 1.1;
  /** Stepped seating that rises away from the field: solid risers, lighter seat planks, aisles between sections. */
  const stand = (center: number, span: number, direction: number, tiers: number, sections: number) => {
    const aisle = 1.5, section = (span - aisle * (sections - 1)) / sections;
    const peak = wall + tiers * rise, back = standZ + tiers * tread;
    for (let row = 0; row < tiers; row++) {
      const height = wall + (row + 1) * rise, z = direction * (standZ + (row + .5) * tread);
      parts.push(block(center, height / 2, z, span, height, tread + .02, riser));
      for (let index = 0; index < sections; index++) {
        parts.push(block(center - span / 2 + section / 2 + index * (section + aisle), height + .05, z - direction * tread * .1, section, .1, tread * .56, seat));
      }
    }
    parts.push(
      block(center, wall / 2, direction * (standZ - .12), span + .5, wall, .24, shell),
      block(center, wall + .08, direction * (standZ - .12), span + .5, .16, .34, rail),
      block(center, (peak + 1.3) / 2, direction * (back + .2), span + .5, peak + 1.3, .4, shell),
      block(center, peak + 1.36, direction * (back + .2), span + .5, .14, .5, rail),
    );
    // Buttresses give the back wall a rhythm where a camera sees it from behind.
    for (let post = 0; post <= sections * 2; post++) {
      parts.push(block(center - span / 2 + post * span / (sections * 2), (peak + 1.3) / 2, direction * (back + .5), .45, peak + 1.3, .3, riser));
    }
    return { peak, back };
  };
  const mesh = () => {
    const stands = new THREE.Mesh(merged(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92 }));
    parts = [];
    return stands;
  };
  const far = stand(0, width * .92, -1, 14, 5);
  // The press box and its window band crown the far stand.
  const boxZ = -(far.back + 2.5), boxY = far.peak + 1.3;
  parts.push(
    block(0, boxY + 1.75, boxZ, width * .3, 3.5, 4.6, '#2b333c'),
    block(0, boxY + 2.05, boxZ + 2.32, width * .285, 1.35, .08, '#a9c5d1', 1.25),
    block(0, boxY + 3.62, boxZ + .4, width * .32, .24, 6, '#171b20'),
    block(-width * .1, boxY / 2, boxZ, .7, boxY, .7, shell),
    block(width * .1, boxY / 2, boxZ, .7, boxY, .7, shell),
  );
  const farStand = mesh();
  const homeSpan = width * .34, homeCenter = width * .12 + homeSpan / 2;
  stand(-homeCenter, homeSpan, 1, 7, 3);
  stand(homeCenter, homeSpan, 1, 7, 3);
  const homeStand = mesh();
  const group = new THREE.Group();
  group.add(base, farStand, homeStand);
  // What the cameras keep in view when there is spare height: the far stand and press box, and the near track.
  const backdrop = [-1, 1].flatMap(side => [
    new THREE.Vector3(side * width * .46, far.peak + 1.4, -far.back),
    new THREE.Vector3(side * width * .16, boxY + 3.8, boxZ),
    new THREE.Vector3(side * halfWidth, 0, planDepth),
  ]);
  return { group, backdrop, standZ, stands: [{ side: -1, mesh: farStand }, { side: 1, mesh: homeStand }] };
}

function updateRoster(state: SceneState, roster: string) {
  if (state.roster === roster) return;
  const performers = JSON.parse(roster) as SceneState['performers'];
  if (performers.length > state.capacity) {
    state.capacity = performerCapacity(performers.length);
    for (const key of meshKeys) {
      const previous = state[key];
      const mesh = new THREE.InstancedMesh(previous.geometry, previous.material, state.capacity * (key === 'legs' ? 2 : 1));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = previous.castShadow;
      mesh.receiveShadow = previous.receiveShadow;
      mesh.renderOrder = previous.renderOrder;
      state.scene.remove(previous);
      previous.dispose();
      state.scene.add(mesh);
      state[key] = mesh;
    }
  }
  state.performers = performers;
  state.roster = roster;
  for (const key of meshKeys) state[key].count = performers.length * (key === 'legs' ? 2 : 1);
  paintRoster(state);
}

/** The jacket takes an authored costume color; the shako always shows the section. */
function paintRoster({ performers, bodies, caps }: Pick<SceneState, 'performers' | 'bodies' | 'caps'>) {
  performers.forEach((performer, index) => {
    const color = castColor(performer.color);
    bodies.setColorAt(index, performer.appearance?.costumeColor ? castColor(performer.appearance.costumeColor) : color);
    caps.setColorAt(index, color);
  });
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
}

/** Scale a leg pose with the figure. Feet stay planted: the ankle scales about its standing height. */
function scalePose(pose: LegPose | undefined, scale: number): LegPose | undefined {
  if (!pose || scale === 1) return pose;
  const joint = ([x, y, z]: LegPose['hip'], ground = 0) => [x * scale, ground + (y - ground) * scale, z * scale] as const;
  return { ...pose, hip: joint(pose.hip), knee: joint(pose.knee), ankle: joint(pose.ankle, .14) };
}

function makeFieldTexture(surface: Surface, owner: Document, image?: HTMLImageElement) {
  const { width, height, preset } = surface;
  const canvas = owner.createElement('canvas');
  const resolution = 2048 / Math.max(width, height);
  canvas.width = Math.round(width * resolution);
  canvas.height = Math.round(height * resolution);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The field texture could not be created.');
  context.scale(canvas.width / width, canvas.height / height);
  if (isCustomSurface(surface)) {
    context.fillStyle = preset === 'indoor' ? '#343139' : '#292f3a';
    context.fillRect(0, 0, width, height);
    const background = surface.background;
    if (background && image) context.drawImage(image, background.x, background.y, background.width, background.height);
    context.strokeStyle = '#e7edf5';
    context.globalAlpha = .48;
    context.lineWidth = .09;
    context.setLineDash([.35, .2]);
    context.beginPath();
    for (const x of surfaceReferences(surface, 'x').slice(1, -1)) { context.moveTo(x, 0); context.lineTo(x, height); }
    for (const y of surfaceReferences(surface, 'y').slice(1, -1)) { context.moveTo(0, y); context.lineTo(width, y); }
    context.stroke();
    context.globalAlpha = 1;
    context.setLineDash([]);
    context.lineWidth = .15;
    context.strokeRect(.075, .075, width - .15, height - .15);
    const mark = Math.min(width, height, 30) / 24;
    context.beginPath();
    context.moveTo(0, mark);
    context.lineTo(0, 0);
    context.lineTo(mark, 0);
    context.stroke();
  } else {
    // The same turf, stripes and line color as the 2D field, so the two views read as one surface.
    context.fillStyle = '#233c31';
    context.fillRect(0, 0, width, height);
    for (let x = 0; x < width; x += 10) {
      context.fillStyle = '#284337';
      context.fillRect(x, 0, Math.min(5, width - x), height);
    }
    context.strokeStyle = '#ccdcc9';
    context.lineWidth = 0.27;
    context.globalAlpha = 0.62;
    context.strokeRect(0.135, 0.135, width - 0.27, height - 0.27);
    context.lineWidth = 0.15;
    const hashInset = preset === 'college' ? 20 : height / 3;
    for (let x = 1; x < width; x++) {
      context.globalAlpha = x % 10 === 0 ? 0.62 : 0.45;
      context.beginPath();
      if (x % 5 === 0) {
        context.moveTo(x, 0);
        context.lineTo(x, height);
      } else {
        for (const [from, to] of [[0, 0.75], [height - 0.75, height], [hashInset - 0.3, hashInset + 0.3], [height - hashInset - 0.3, height - hashInset + 0.3]]) {
          context.moveTo(x, from);
          context.lineTo(x, to);
        }
      }
      context.stroke();
    }
    context.globalAlpha = 0.6;
    context.fillStyle = '#d9e0c7';
    context.font = 'bold 2.6px Arial';
    context.textAlign = 'center';
    for (let x = 10; x < width; x += 10) {
      const text = String(Math.min(x, width - x));
      context.fillText(text, x, height - 4.2);
      context.save();
      context.translate(x, 6.3);
      context.rotate(Math.PI);
      context.fillText(text, 0, 0);
      context.restore();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function updatePerformers(state: SceneState, positions: Record<string, Point>, facings: PerformerFacings | undefined, selectedIds: string[], width: number, height: number, equipmentEnabled: boolean, legMotion?: LegMotionFrame, cues?: ChoreographySample) {
  const transform = new THREE.Object3D();
  const selected = new Set(selectedIds);
  const size = state.castScale;
  const hasStance = (id: string) => cues?.lowerBodyIds.has(id) ?? false;
  const rig = legMotion || state.performers.some(person => hasStance(person.id))
    ? (state.legMotion ??= new LegMotionMeshes(state.scene, state.capacity)) : undefined;
  if (rig) rig.begin(state.capacity, state.performers.length);
  else state.legMotion?.hide();
  state.legs.visible = !legMotion && state.performers.some(person => !hasStance(person.id));
  const showHeadings = !!facings;
  const showRoles = state.performers.some(person => person.role && !(equipmentEnabled && person.equipment));
  const assets: AssetPlacement[] = [];
  let ringCount = 0;
  state.performers.forEach((performer, index) => {
    const point = positions[performer.id];
    const x = point ? point.x - width / 2 : 0;
    const z = point ? point.y - height / 2 : 0;
    const visible = point ? size : 0;
    const stance = hasStance(performer.id) ? cues?.lowerBody.get(performer.id) ?? neutralCuePose : undefined;
    const cuePose = point && stance ? sampleCueLegPose(stance) : undefined;
    const bodyHeight = -(stance?.drop ?? 0) * size;
    const facing = facingAt(facings, performer.id);
    const angle = THREE.MathUtils.degToRad(facing ?? 0);
    const sin = Math.sin(angle), cos = Math.cos(angle);
    const bodyX = x + (cuePose?.bodyX ?? 0) * size * cos;
    const bodyZ = z - (cuePose?.bodyX ?? 0) * size * sin;
    // Jacket, head and shako share one matrix: their heights are part of the geometry.
    transform.rotation.set(0, angle, 0);
    transform.scale.setScalar(visible);
    transform.position.set(bodyX, bodyHeight, bodyZ);
    transform.updateMatrix();
    state.bodies.setMatrixAt(index, transform.matrix);
    state.heads.setMatrixAt(index, transform.matrix);
    state.caps.setMatrixAt(index, transform.matrix);
    if (rig) {
      const pose = cuePose?.legs ?? (point && legMotion
        ? sampleLegPose(legMotion.count, point, legMotion.nextPositions[performer.id], facing, legMotion.markTime?.has(performer.id) ?? false)
        : undefined);
      rig.setLeg(index * 2, x, z, angle, scalePose(pose?.[0], size));
      rig.setLeg(index * 2 + 1, x, z, angle, scalePose(pose?.[1], size));
    }
    if (state.legs.visible) {
      transform.scale.setScalar(stance ? 0 : visible);
      for (let leg = 0; leg < 2; leg++) {
        const side = (leg === 0 ? -0.105 : 0.105) * size;
        transform.position.set(x + side * cos, 0, z - side * sin);
        transform.updateMatrix();
        state.legs.setMatrixAt(index * 2 + leg, transform.matrix);
      }
    }
    // The contact shadow leans away from the sun; the selection ring sits just above it.
    transform.rotation.set(-Math.PI / 2, 0, 0);
    transform.scale.setScalar(visible);
    transform.position.set(bodyX + .07 * size, TURF_Y + .006, bodyZ - .1 * size);
    transform.updateMatrix();
    state.shadows.setMatrixAt(index, transform.matrix);
    if (point && selected.has(performer.id)) {
      // Only selected performers have a ring, so a large cast does not carry hundreds of empty ones.
      transform.position.set(x, TURF_Y + .012, z);
      transform.updateMatrix();
      state.rings.setMatrixAt(ringCount++, transform.matrix);
    }

    if (showHeadings) {
      transform.position.set(x + .5 * size * sin, TURF_Y + .04, z + .5 * size * cos);
      transform.rotation.set(Math.PI / 2, angle, 0, 'YXZ');
      transform.scale.setScalar(point && facing !== undefined ? size : 0);
      transform.updateMatrix();
      state.headings.setMatrixAt(index, transform.matrix);
    }

    if (point && equipmentEnabled && performer.equipment) {
      const placement = { at: [bodyX, bodyHeight, bodyZ] as const, angle, flagColor: performer.appearance?.flagColor, ...(size === 1 ? {} : { scale: [size, size, size] as const }) };
      if (performer.equipment === 'flag' && cues?.flagIds.has(performer.id)) {
        const pitch = (1 - (cues.flags.get(performer.id) ?? 0)) * (50 * Math.PI / 180);
        assets.push({ ...placement, parts: flagHolderParts }, { ...placement, parts: flagPoleParts, tilt: { pivot: flagGrip, pitch } });
      } else assets.push({ ...placement, parts: carriedModels[performer.equipment] });
    }
    if (showRoles) {
      const role = equipmentEnabled && performer.equipment ? undefined : performer.role;
      transform.rotation.set(0, angle, 0);
      if (role === 'guard') {
        transform.position.set(bodyX + .35 * size * cos, 1.48 * size + bodyHeight, bodyZ - .35 * size * sin);
        transform.scale.set(.45 * visible, .24 * visible, .07 * visible);
      } else {
        transform.position.set(bodyX + .33 * size * sin, 1.05 * size + bodyHeight, bodyZ + .33 * size * cos);
        transform.scale.set(.33 * visible, .18 * visible, .34 * visible);
      }
      if (!role) transform.scale.setScalar(0);
      transform.updateMatrix();
      state.roleMarkers.setMatrixAt(index, transform.matrix);
    }
  });
  rig?.commit();
  state.carried.update(assets);
  state.headings.visible = showHeadings;
  state.roleMarkers.visible = showRoles;
  state.rings.count = ringCount;
  state.rings.visible = ringCount > 0;
  for (const key of meshKeys) {
    const mesh = state[key];
    if (!mesh.visible) continue;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
}

export function Stage3D({ project, positions, facings, staging, selectedIds, onSelect, quality, onQualityChange, onReturnTo2D, recovery, cameraRequest, onCameraPreset, hideCameraPresets, splitReview, previewCamera, legMotion, cueTiming, assetReview, cameraLibrary, activeCamera, capture }: Stage3DProps) {
  const cameraProps=useRef({cameraRequest,onCameraPreset,splitReview,activeCamera});cameraProps.current={cameraRequest,onCameraPreset,splitReview,activeCamera};
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const [stadiumVisible, setStadiumVisible] = useState(true);
  const [cameraSnapshot, setCameraSnapshot] = useState<CameraView | null>(null);
  const equipmentEnabled = assetReview?.showEquipment ?? quality === 'detailed';
  const program = useMemo(() => compileChoreography(project), [project.choreography, project.moves]);
  const cues = useMemo(() => equipmentEnabled && cueTiming ? sampleChoreography(program, cueTiming) : undefined,
    [equipmentEnabled, program, cueTiming]);
  const pit = assetReview?.pit;
  const onAssetFrame = assetReview?.onFrame;
  const currentRef = useRef({ positions, facings, selectedIds, onSelect, quality, recovery, legMotion, previewCamera, equipmentEnabled, cues, onAssetFrame });
  currentRef.current = { positions, facings, selectedIds, onSelect, quality, recovery, legMotion, previewCamera, equipmentEnabled, cues, onAssetFrame };
  const [error, setError] = useState<string | null>(null);
  const width = project.field.width;
  const height = project.field.height;
  const surface = project.field;
  const customSurface = isCustomSurface(surface);
  const roster = useMemo(() => {
    const sections = new Map(project.sections.map(section => [section.id, section]));
    return JSON.stringify(project.performers.map(performer => {
      const section = sections.get(performer.sectionId);
      const { key, role } = resolveEquipment(performer.appearance, section?.equipment);
      return { id: performer.id, color: section?.color ?? '#b9ed85', appearance: performer.appearance, role, equipment: key };
    }));
  }, [project.performers, project.sections]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setError(null);
    // The canvas may live in the separate 3D window: use its document, clock, size and pixel ratio.
    const owner = host.ownerDocument;
    const view = (owner.defaultView ?? window) as Window & typeof globalThis;
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let frames: ReturnType<typeof createDemandFrames> | undefined;
    const invalidate = () => frames?.invalidate();
    let disposed = false;
    const scene = new THREE.Scene();
    const cleanups: (() => void)[] = [];

    function cleanup() {
      if (disposed) return;
      disposed = true;
      frames?.dispose();
      resizeObserver?.disconnect();
      controls?.dispose();
      cleanups.forEach(callback => callback());
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
          objectMaterials.forEach(material => {
            materials.add(material);
            Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
          });
          if (object instanceof THREE.InstancedMesh) object.dispose();
        }
        if (object instanceof THREE.Light && 'shadow' in object) (object.shadow as THREE.LightShadow).dispose();
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
      sceneRef.current = null;
    }

    function fail(cause: unknown) {
      cleanup();
      if (capture) {
        capture.failed(new Error('The 3D scene could not render. Check your device’s WebGL support and try again.', { cause }));
        return;
      }
      setError(cause instanceof Error && cause.message.includes('texture') ? cause.message : currentRef.current.recovery?.unavailable ?? 'This device could not render a WebGL preview. Your drill is still available in the 2D editor.');
    }

    try {
      renderer = new THREE.WebGLRenderer({ canvas: owner.createElement('canvas'), antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(capture ? 1 : Math.min(view.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      // No filmic curve: level turf lands on its painted color, so the field and each section match the 2D view.
      renderer.toneMapping = THREE.LinearToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.domElement.tabIndex = 0;
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.setAttribute('aria-label', `Three dimensional drill preview. Drag to orbit, right-drag to pan${currentRef.current.onSelect ? ', scroll to zoom, and click a performer to select' : ' and scroll to zoom'}. ${currentRef.current.previewCamera ? 'Use Camera view to choose an inspection angle.' : 'Use the camera controls to change the viewing angle.'}`);
      host.appendChild(renderer.domElement);
      const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      const halfWidth = width / 2, halfDepth = height / 2;
      const castScale = currentRef.current.previewCamera || assetReview ? 1 : CAST_SCALE;

      // The scene sits in the same well as the 2D field: a floor that glows under the field and falls off to the pane color.
      const token = (name: string, fallback: string) => {
        const value = view.getComputedStyle(host).getPropertyValue(name).trim();
        return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
      };
      const background = new THREE.Color();
      const fog = new THREE.Fog(background, 100, 400);
      scene.background = background;
      scene.fog = fog;
      const floorCanvas = owner.createElement('canvas');
      floorCanvas.width = floorCanvas.height = 256;
      const floorTexture = new THREE.CanvasTexture(floorCanvas);
      floorTexture.colorSpace = THREE.SRGBColorSpace;
      let themed = '';
      const applyTheme = () => {
        const well = token('--field-well', '#0b0d0f'), glow = token('--field-well-glow', '#141a17');
        if (themed === well + glow) return;
        themed = well + glow;
        background.set(well);
        fog.color.set(well);
        paintFloor(floorCanvas, glow, well);
        floorTexture.needsUpdate = true;
        invalidate();
      };
      applyTheme();
      const themeObserver = new view.MutationObserver(applyTheme);
      themeObserver.observe(owner.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      cleanups.push(() => themeObserver.disconnect());

      const camera = new THREE.PerspectiveCamera(PRESET_FOV, 1, 0.1, 500);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = currentRef.current.previewCamera ? 2 : 12;
      controls.maxDistance = 175;
      controls.maxPolarAngle = Math.PI / 2 - 0.025;
      controls.target.set(0, 0, 0);
      controls.addEventListener('change', invalidate);
      cleanups.push(() => controls?.removeEventListener('change', invalidate));
      // A preset keeps framing the field as its pane changes shape, until the director takes the camera.
      let framed: CameraPreset | null = null;
      const orbit = () => { framed = null; cameraProps.current.onCameraPreset?.(null); };
      controls.addEventListener('start',orbit);cleanups.push(()=>controls?.removeEventListener('start',orbit));
      const readCamera = (): CameraView => ({ position: camera.position.toArray(), target: controls!.target.toArray(), projection: 'perspective', fov: camera.fov });
      let stadium: ReturnType<typeof buildStadium> | undefined;
      let stadiumShown = false;
      const sceneRadius = customSurface ? Math.hypot(halfWidth, halfDepth) + 12 : Math.hypot(halfWidth + 42, halfDepth + 42);
      /** Depth precision follows the camera: a far camera pushes the near plane out, so distant surfaces never shimmer. */
      const fitDepth = () => {
        const reach = camera.position.length();
        const near = THREE.MathUtils.clamp((reach - sceneRadius) / 2, .1, 6), far = reach + sceneRadius * 3.2;
        if (camera.near !== near || camera.far !== far) {
          camera.near = near;
          camera.far = far;
          camera.updateProjectionMatrix();
        }
        fog.near = reach + sceneRadius * .1;
        fog.far = reach + sceneRadius * 4.6;
        if (stadium) {
          // Cutaway: a camera that drops low behind a stand would see only the back of it, so that stand fades out of the way.
          const { x, y, z } = camera.position;
          const low = THREE.MathUtils.smoothstep(Math.atan2(y, Math.hypot(x, z)), rad(28), rad(33));
          for (const { side, mesh } of stadium.stands) {
            const shown = side * z < stadium.standZ ? 1 : low;
            mesh.material.opacity = shown;
            mesh.material.transparent = shown < 1;
            mesh.visible = shown > .01;
          }
        }
      };
      const pane = { width: 0, height: 0 };
      /** Room kept clear of the floating controls, as fractions of the pane. The control chip wraps in narrow panes, so it is measured. */
      const insets = (): Insets => {
        if (capture || pane.height < 2) return { top: .04, right: .03, bottom: .04, left: .03 };
        const chip = host.parentElement?.querySelector('.stage-three__controls, .stage-three__quality');
        const chipBottom = chip ? chip.getBoundingClientRect().bottom - host.getBoundingClientRect().top : 0;
        return {
          top: Math.min((chipBottom > 0 ? chipBottom + 6 : 16) / pane.height, .3), bottom: Math.min(22 / pane.height, .12),
          left: Math.min(16 / pane.width, .08), right: Math.min(16 / pane.width, .08),
        };
      };
      const landCamera = (position: THREE.Vector3, target: THREE.Vector3) => {
        if (!controls) return;
        // A preset should land exactly even if the user clicks during damping.
        controls.enableDamping = false;
        controls.update();
        controls.target.copy(target);
        camera.position.copy(position);
        controls.update();
        controls.enableDamping = true;
        invalidate();
      };
      const frame = (preset: CameraPreset) => {
        if (!controls) return;
        const backdrop = stadiumShown && stadium ? stadium.backdrop : [];
        const { azimuth, elevation } = presetAngles(preset, camera.aspect, !backdrop.length);
        const margin = 3.6, crown = 2.3 * castScale;
        const subject = [-1, 1].flatMap(x => [-1, 1].flatMap(z => [
          new THREE.Vector3(x * (halfWidth + margin), 0, z * (halfDepth + margin)), new THREE.Vector3(x * halfWidth, crown, z * halfDepth),
        ]));
        // The field is the subject: it fills the pane, and the stands behind it are scenery that may run off the edges.
        const shot = fitView(azimuth, elevation, PRESET_FOV, camera.aspect, insets(), subject, []);
        controls.minDistance = currentRef.current.previewCamera ? 2 : 12;
        controls.maxDistance = Math.max(175, shot.reach * 1.8);
        controls.maxPolarAngle = Math.PI / 2 - 0.025;
        camera.up.set(0, 1, 0);
        camera.fov = PRESET_FOV;
        camera.updateProjectionMatrix();
        landCamera(shot.position, shot.target);
        framed = preset;
      };
      const setCamera = (preset: CameraPreset) => {
        frame(preset);
        cameraProps.current.onCameraPreset?.(preset);
      };
      const setPreviewCamera = ({ position, target }: PreviewCamera) => {
        framed = null;
        landCamera(new THREE.Vector3(...position), new THREE.Vector3(...target));
      };
      const restoreCamera = (saved: CameraView) => {
        if (!controls) return;
        const offset = new THREE.Vector3(...saved.position).sub(new THREE.Vector3(...saved.target));
        const distance = offset.length();
        controls.minDistance = Math.min(12, distance);
        controls.maxDistance = Math.max(175, distance * 1.8);
        controls.maxPolarAngle = Math.max(Math.PI / 2 - .025, Math.acos(THREE.MathUtils.clamp(offset.y / distance, -1, 1)));
        camera.fov = saved.fov;
        camera.updateProjectionMatrix();
        setPreviewCamera(saved);
      };
      if (capture) {
        camera.aspect = capture.width / capture.height;
        if (capture.camera) restoreCamera(capture.camera);
        else setCamera('perspective');
      } else if (currentRef.current.previewCamera) setPreviewCamera(currentRef.current.previewCamera);
      else if (cameraProps.current.activeCamera) restoreCamera(cameraProps.current.activeCamera);
      else setCamera(cameraProps.current.cameraRequest?.preset ?? 'perspective');

      // Level turf reads at its painted color; the sun comes over the audience's left shoulder and lights the cast's fronts.
      scene.add(new THREE.HemisphereLight('#f3f6f4', '#7a847f', 2));
      const sun = new THREE.DirectionalLight('#fff6e6', 1.55);
      sun.position.set(-.3, .86, .42).multiplyScalar(110);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -width * 0.7;
      sun.shadow.camera.right = width * 0.7;
      sun.shadow.camera.top = height * 0.9;
      sun.shadow.camera.bottom = -height * 0.9;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 220;
      sun.shadow.intensity = 0.7;
      sun.shadow.normalBias = 0.07;
      sun.shadow.bias = -0.00015;
      scene.add(sun);

      const floor = new THREE.Mesh(new THREE.CircleGeometry(sceneRadius * 2.6, 64), new THREE.MeshBasicMaterial({ map: floorTexture, toneMapped: false, fog: false }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.4;
      scene.add(floor);
      // The sideline apron frames the field when the stadium is hidden. Its field-shaped cutout keeps it out from under the turf.
      const apron = new THREE.Mesh(groundAround(roundedRect(halfWidth + 3, halfDepth + 3, 1.1), fieldCutout(halfWidth, halfDepth)), new THREE.MeshStandardMaterial({ roughness: 1 }));
      const curb = new THREE.Mesh(groundAround(roundedRect(halfWidth + 3.26, halfDepth + 3.26, 1.36), new THREE.Path(roundedRect(halfWidth + 3, halfDepth + 3, 1.1).getPoints(8))), new THREE.MeshStandardMaterial({ roughness: 1 }));
      for (const mesh of [apron, curb]) {
        mesh.position.y = TURF_Y;
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
      const styleSurround = (custom: boolean) => {
        apron.material.color.set(custom ? '#22262c' : '#273a34');
        curb.material.color.set(custom ? '#3d444d' : '#46574c');
      };
      styleSurround(customSurface);
      const fieldTexture = makeFieldTexture(surface, owner);
      fieldTexture.anisotropy = anisotropy;
      const field = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: fieldTexture, roughness: 1, metalness: 0 }));
      field.rotation.x = -Math.PI / 2;
      field.position.y = TURF_Y;
      field.receiveShadow = true;
      scene.add(field);

      // An understated home-side podium makes field orientation immediately visible.
      const podiums = new THREE.Group();
      podiums.visible = !customSurface;
      scene.add(podiums);
      const podiumMaterial = new THREE.MeshStandardMaterial({ color: '#5d6873', roughness: 0.8 });
      for (let i = 0; i < 3; i++) {
        const podium = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4 + i * 0.42, 0.8), podiumMaterial);
        podium.position.set(0, (0.4 + i * 0.42) / 2, height / 2 + 2.5 - i * 0.75);
        podium.castShadow = true;
        podium.receiveShadow = true;
        podiums.add(podium);
      }
      const setStadium = (visible: boolean) => {
        if (visible === stadiumShown) return;
        stadiumShown = visible;
        // Built on first use: indoor floors and custom stages never pay for it.
        if (visible && !stadium) {
          stadium = buildStadium(width, height, owner, anisotropy);
          scene.add(stadium.group);
        }
        if (stadium) stadium.group.visible = visible;
        apron.visible = curb.visible = !visible;
        if (framed) frame(framed);
        invalidate();
      };

      const performers = JSON.parse(roster) as SceneState['performers'];
      const count = performerCapacity(performers.length);
      const figure = figureGeometries();
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.8 });
      const bodies = new THREE.InstancedMesh(figure.jacket, bodyMaterial, count);
      const heads = new THREE.InstancedMesh(figure.head, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), count);
      const caps = new THREE.InstancedMesh(figure.shako, bodyMaterial, count);
      const legs = new THREE.InstancedMesh(figure.leg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), count * 2);
      // Marks drawn on the turf are pulled toward the camera in depth, so they never flicker against it.
      const decal = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
      const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshBasicMaterial({ ...decal, map: makeContactShadow(owner), toneMapped: false }), count);
      const rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.58, 0.72, 28), new THREE.MeshBasicMaterial({ ...decal, color: token('--field-accent', '#ffffff'), side: THREE.DoubleSide, opacity: 0.95, toneMapped: false }), count);
      const headings = new THREE.InstancedMesh(new THREE.ConeGeometry(.12, .34, 4), new THREE.MeshBasicMaterial({ color: '#f5f5e8' }), count);
      const roleMarkers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#dbcca9' }), count);
      shadows.renderOrder = 1;
      rings.renderOrder = 2;
      for (const mesh of [bodies, heads, caps, legs, shadows, rings, headings, roleMarkers]) {
        mesh.count = mesh === legs ? performers.length * 2 : performers.length;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = mesh !== rings && mesh !== headings && mesh !== shadows;
        mesh.receiveShadow = mesh !== rings && mesh !== shadows;
        scene.add(mesh);
      }
      paintRoster({ performers, bodies, caps });
      const setQuality = (value: Stage3DQuality) => {
        if (!renderer) return;
        renderer.shadowMap.enabled = value === 'detailed';
        renderer.shadowMap.needsUpdate = true;
        renderer.setPixelRatio(capture ? 1 : Math.min(view.devicePixelRatio || 1, value === 'detailed' ? 2 : 1));
        invalidate();
      };
      let textureSurface = surface;
      let textureImage: HTMLImageElement | undefined;
      const setFieldSurface = (next: Surface, image?: HTMLImageElement) => {
        if (!renderer || (textureSurface === next && textureImage === image)) return;
        if (!isCustomSurface(next) && textureSurface.preset === next.preset) return;
        podiums.visible = !isCustomSurface(next);
        styleSurround(isCustomSurface(next));
        const texture = makeFieldTexture(next, owner, image);
        texture.anisotropy = anisotropy;
        const previous = field.material.map;
        field.material.map = texture;
        field.material.needsUpdate = true;
        previous?.dispose();
        textureSurface = next;
        textureImage = image;
        invalidate();
      };
      const assets = new AssetResources();
      const drawFrame: SceneState['drawFrame'] = (sample, destination) => {
        if (!renderer || disposed || renderer.getContext().isContextLost()) throw new Error('The 3D graphics context was interrupted. Try exporting with Lightweight quality.');
        const details = currentRef.current.equipmentEnabled;
        updatePerformers(state, sample.positions, sample.facings, [], width, height, details, undefined, details ? sampleChoreography(program, sample) : undefined);
        state.staging.update(stagingPlacements(sample.staging, width, height));
        fitDepth();
        renderer.render(scene, camera);
        destination.drawImage(renderer.domElement, 0, 0);
      };
      const state: SceneState = { scene, capacity: count, roster, performers, castScale, bodies, heads, caps, legs, shadows, rings, headings, roleMarkers,
        carried: new AssetBatches(scene, assets), staging: new AssetBatches(scene, assets), pit: new AssetBatches(scene, assets),
        setCamera, setPreviewCamera, readCamera, restoreCamera, drawFrame, setQuality, setFieldSurface, setStadium, invalidate, fail };
      sceneRef.current = state;
      updatePerformers(state, currentRef.current.positions, currentRef.current.facings, currentRef.current.selectedIds, width, height, currentRef.current.equipmentEnabled, currentRef.current.legMotion, currentRef.current.cues);

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let press: { x: number; y: number; shift: boolean } | null = null;
      const onPointerDown = (event: PointerEvent) => {
        if (event.button === 0) press = { x: event.clientX, y: event.clientY, shift: event.shiftKey };
      };
      const onPointerUp = (event: PointerEvent) => {
        if (!press || !renderer) return;
        const start = press;
        press = null;
        const select = currentRef.current.onSelect;
        if (!select) return;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
        const bounds = renderer.domElement.getBoundingClientRect();
        pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects([state.bodies, state.heads, state.caps], false)[0];
        const id = hit?.instanceId === undefined ? undefined : state.performers[hit.instanceId]?.id;
        const current = currentRef.current;
        if (!id) { if (!start.shift) select([]); return; }
        select(start.shift ? selectionMembership(current.selectedIds).has(id) ? current.selectedIds.filter(selected => selected !== id) : [...current.selectedIds, id] : [id]);
      };
      const onContextLost = (event: Event) => {
        event.preventDefault();
        if (capture) {
          fail(new Error('The 3D graphics context was interrupted.'));
          return;
        }
        if (!disposed) {
          cleanup();
          setError(currentRef.current.recovery?.contextLost ?? 'The graphics context was interrupted. Return to 2D and open 3D again to reload the preview.');
        }
      };
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('webglcontextlost', onContextLost);
      cleanups.push(() => {
        renderer?.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer?.domElement.removeEventListener('pointerup', onPointerUp);
        renderer?.domElement.removeEventListener('webglcontextlost', onContextLost);
      });
      if (capture) {
        setQuality(currentRef.current.quality);
        renderer.setSize(capture.width, capture.height, false);
        return cleanup;
      }
      function resize() {
        if (!renderer || !host) return;
        const rect = host.getBoundingClientRect();
        const w = Math.max(rect.width, 1);
        const h = Math.max(rect.height, 1);
        const reshaped = pane.width !== w || pane.height !== h;
        pane.width = w;
        pane.height = h;
        camera.aspect = w / h;
        // Every preset reframes the field for the pane's new shape; a hand-placed camera only updates its projection.
        if (framed && reshaped) frame(framed);
        else camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        invalidate();
      }
      resizeObserver = new view.ResizeObserver(resize);
      resizeObserver.observe(host);
      resize();
      frames = createDemandFrames(() => {
        if (disposed || !renderer) return false;
        const changed = controls?.update() ?? false;
        fitDepth();
        renderer.render(scene, camera);
        const { calls, triangles } = renderer.info.render;
        currentRef.current.onAssetFrame?.({ calls, triangles, geometries: renderer.info.memory.geometries });
        return changed;
      }, fail, view);
      setQuality(currentRef.current.quality);
      invalidate();
    } catch (cause) {
      fail(cause);
    }
    return cleanup;
  }, [width, height, capture]);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    try {
      updateRoster(state, roster);
      updatePerformers(state, positions, facings, selectedIds, width, height, equipmentEnabled, legMotion, cues);
      state.invalidate();
    } catch (cause) { state.fail(cause); }
  }, [positions, facings, selectedIds, width, height, roster, equipmentEnabled, legMotion, cues]);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    try {
      state.staging.update(stagingPlacements(staging, width, height));
      state.invalidate();
    } catch (cause) { state.fail(cause); }
  }, [staging, width, height, capture]);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    try {
      state.pit.update(pit ?? []);
      state.setStadium(stadiumVisible && !customSurface);
      state.invalidate();
    } catch (cause) { state.fail(cause); }
  }, [pit, stadiumVisible, customSurface, width, height]);

  useEffect(() => { if (previewCamera) sceneRef.current?.setPreviewCamera(previewCamera); }, [previewCamera]);
  useEffect(() => { if (activeCamera) sceneRef.current?.restoreCamera(activeCamera); }, [activeCamera]);
  useEffect(() => { sceneRef.current?.setQuality(quality); }, [quality, width, height]);
  useEffect(()=>{if(cameraRequest?.preset)sceneRef.current?.setCamera(cameraRequest.preset);},[cameraRequest?.version,width,height,splitReview]);
  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    const apply = (image?: HTMLImageElement) => {
      try {
        state.setFieldSurface(surface, image);
        if (capture) queueMicrotask(() => {
          // React development remounts dispose the first scene before exporting can use it.
          if (sceneRef.current === state) capture.ready(state.drawFrame);
        });
      }
      catch (cause) { state.fail(cause); }
    };
    if (!isCustomSurface(surface) || !surface.background) { apply(); return; }
    if (!capture) apply();
    const image = hostRef.current!.ownerDocument.createElement('img');
    image.onload = () => apply(image);
    image.onerror = () => capture?.failed(new Error('The field background could not be loaded for export.'));
    image.src = surface.background.image;
    return () => { image.onload = null; image.onerror = null; };
  }, [surface, capture]);

  if (capture) return <div ref={hostRef} hidden />;
  return <div className={splitReview ? "stage-three stage-three--split" : "stage-three"}>
    <div ref={hostRef} className="stage-three__canvas" />
    {!error && <>
      <div className="field-stage__corner"><span className="stage-status-light" /> LIVE 3D PREVIEW</div>
      <div className={hideCameraPresets ? 'stage-three__quality' : `stage-three__controls${splitReview ? ' stage-three__controls--split' : ''}`}
        role="group" aria-label={hideCameraPresets ? 'Rendering quality' : 'Camera presets'}>
        {splitReview && <Tooltip name="Review camera" description="Choose a viewing angle while editing or rehearsing.">
          <select aria-label="Review camera" value={cameraRequest?.preset ?? ''} onChange={event => {
            const preset = event.currentTarget.value as CameraPreset;
            if (preset) sceneRef.current?.setCamera(preset);
          }}>
            <option value="" disabled>{activeCamera?.name ?? 'Custom angle'}</option>
            <option value="perspective">Perspective</option>
            <option value="press-box">Press box</option>
            <option value="front">Front</option>
            <option value="top">Overhead</option>
          </select>
        </Tooltip>}
        {!hideCameraPresets&&!splitReview&&<>
        <HelpButton title="Perspective camera" aria-pressed={cameraRequest?cameraRequest.preset==='perspective':undefined} description="Reset the camera to an angled view of the entire field. Drag to orbit, right-drag to pan and scroll to zoom." type="button" onClick={() => sceneRef.current?.setCamera('perspective')}>Perspective</HelpButton>
        <HelpButton title="Front camera" aria-pressed={cameraRequest?cameraRequest.preset==='front':undefined} description="Reset the camera to the home sideline view. Drag to orbit, right-drag to pan and scroll to zoom." type="button" onClick={() => sceneRef.current?.setCamera('front')}>Front</HelpButton>
        <HelpButton title="Press box camera" aria-pressed={cameraRequest ? cameraRequest.preset === 'press-box' : undefined} description="Look down on the field from above the home sideline." type="button" onClick={() => sceneRef.current?.setCamera('press-box')}>Press box</HelpButton>
        <HelpButton title="Overhead camera" aria-pressed={cameraRequest?cameraRequest.preset==='top':undefined} description="Reset the camera to look straight down at the field. Drag to orbit, right-drag to pan and scroll to zoom." type="button" onClick={() => sceneRef.current?.setCamera('top')}>Overhead</HelpButton>
        </>}
        {!customSurface && <label className="stage-three__stadium">
          <Tooltip name="Stadium" description="Show or hide the stands and press box around the field.">
            <input type="checkbox" checked={stadiumVisible} onChange={event => setStadiumVisible(event.target.checked)} />
          </Tooltip>
          Stadium
        </label>}
        <Tooltip name="3D quality" description="Choose detailed equipment and shadows, or lightweight markers for this device." state={quality}><select aria-label="3D quality" value={quality} onChange={event => onQualityChange(event.target.value as Stage3DQuality)}><option value="detailed">Detailed · shadows</option><option value="lightweight">Lightweight · no shadows</option></select></Tooltip>
        {cameraLibrary && <HelpButton type="button" className="stage-three__saved-cameras" title="Saved camera views" description="Save the current angle or restore a named view from this production." onClick={() => {
          const current = sceneRef.current?.readCamera();
          if (current) {
            setCameraSnapshot(current);
            cameraLibrary.show();
          }
        }}><Camera size={13} aria-hidden="true" />Saved views</HelpButton>}
      </div>
      <div className="field-stage__hint">Drag to orbit · Scroll to zoom<span>Right-drag to pan{onSelect ? ' · Click a performer to select' : ''}</span></div>
    </>}
    {cameraSnapshot && cameraLibrary?.open && <CameraViewsPanel library={cameraLibrary} current={cameraSnapshot} onApply={cameraLibrary.activate} onClose={cameraLibrary.close} />}
    {error && <div className="stage-three__fallback" role="alert">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>
      <strong>3D preview unavailable</strong>
      <p>{error}</p>
      {recovery ? recovery.actions : <HelpButton title="Return to 2D field" description="Return to the editable field view." onClick={onReturnTo2D}>Return to 2D field</HelpButton>}
    </div>}
  </div>;
}
