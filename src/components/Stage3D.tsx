import { isCustomSurface, surfaceReferences, type Surface } from '../surfaces';
import { compileChoreography, neutralCuePose, sampleChoreography, type ChoreographySample } from '../choreography';
import { resolveEquipment, type CarriedEquipment } from '../equipment';
import { AssetBatches, AssetResources } from './3d/assetBatches';
import { carriedModels, flagGrip, flagHolderParts, flagPoleParts, type AssetPlacement } from './3d/assetModels';
import { stadiumParts } from './3d/stadium';
import { facingAt } from '../performerFacing';
import { HelpButton } from '../editor/ControlHelp';
import { Tooltip } from './Tooltip';
import { selectionMembership } from '../selection';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PerformerAppearance, PerformerFacings, Point, Project, TimelineSample } from '../types';
import { createDemandFrames } from './demandFrames';
import { sampleCueLegPose, sampleLegPose, type LegMotionFrame } from './legMotion';
import { LegMotionMeshes } from './legMotionMeshes';
import './stages.css';

export type Stage3DQuality = 'detailed' | 'lightweight';
export interface Stage3DProps {
  project: Project;
  positions: Record<string, Point>;
  facings?: PerformerFacings;
  selectedIds: string[];
  /** Omitted in the read-only 3D window: clicks orbit the camera but never change selection. */
  onSelect?: (ids: string[]) => void;
  quality: Stage3DQuality;
  onQualityChange: (quality: Stage3DQuality) => void;
  onReturnTo2D: () => void;
  cameraRequest?: { preset: CameraPreset | null; version: number };
  onCameraPreset?: (preset: CameraPreset | null) => void;
  hideCameraPresets?: boolean;
  /** A host without its own 2D field (the 3D window) supplies the interruption text and recovery actions. */
  recovery?: { contextLost: string; unavailable?: string; actions: ReactNode };
  /** Tooling can supply a fixed review angle, cue samples, or stationary fixture equipment. */
  previewCamera?: PreviewCamera;
  legMotion?: LegMotionFrame;
  cueTiming?: Pick<TimelineSample, 'setIndex' | 'localCount'>;
  assetReview?: { showEquipment: boolean; pit: readonly AssetPlacement[]; onFrame: (stats: RenderStats) => void };
}

export type CameraPreset = 'perspective' | 'front' | 'top';
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
  pit: AssetBatches;
  stadium: AssetBatches;
  stadiumParts: ReturnType<typeof stadiumParts>;
  bodies: THREE.InstancedMesh;
  heads: THREE.InstancedMesh;
  caps: THREE.InstancedMesh;
  legs: THREE.InstancedMesh;
  legMotion?: LegMotionMeshes;
  rings: THREE.InstancedMesh;
  headings: THREE.InstancedMesh;
  roleMarkers: THREE.InstancedMesh;
  setCamera: (preset: CameraPreset) => void;
  setPreviewCamera: (camera: PreviewCamera) => void;
  setQuality: (quality: Stage3DQuality) => void;
  setFieldSurface: (surface: Surface, background?: HTMLImageElement) => void;
  invalidate: () => void;
  fail: (cause: unknown) => void;
}

const meshKeys = ['bodies', 'heads', 'caps', 'legs', 'rings', 'headings', 'roleMarkers'] as const;
const performerCapacity = (count: number) => Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(count, 1))));

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
      state.scene.remove(previous);
      previous.dispose();
      state.scene.add(mesh);
      state[key] = mesh;
    }
  }
  state.performers = performers;
  state.roster = roster;
  for (const key of meshKeys) state[key].count = performers.length * (key === 'legs' ? 2 : 1);
  performers.forEach((performer, index) => {
    const color = new THREE.Color(performer.color);
    state.bodies.setColorAt(index, performer.appearance?.costumeColor ? new THREE.Color(performer.appearance.costumeColor) : color);
    state.caps.setColorAt(index, color);
  });
  if (state.bodies.instanceColor) state.bodies.instanceColor.needsUpdate = true;
  if (state.caps.instanceColor) state.caps.instanceColor.needsUpdate = true;
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
    context.fillStyle = '#294b36';
    context.fillRect(0, 0, width, height);
    for (let x = 0; x < width; x += 10) {
      context.fillStyle = '#2e523b';
      context.fillRect(x, 0, Math.min(5, width - x), height);
    }
    context.strokeStyle = '#d5dfbc';
    context.lineWidth = 0.15;
    context.globalAlpha = 0.65;
    context.strokeRect(0.1, 0.1, width - 0.2, height - 0.2);
    const hashInset = preset === 'college' ? 20 : height / 3;
    for (let x = 1; x < width; x++) {
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
    context.fillStyle = '#d5dfbc';
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
  const hasStance = (id: string) => cues?.lowerBodyIds.has(id) ?? false;
  const rig = legMotion || state.performers.some(person => hasStance(person.id))
    ? (state.legMotion ??= new LegMotionMeshes(state.scene, state.capacity)) : undefined;
  if (rig) rig.begin(state.capacity, state.performers.length);
  else state.legMotion?.hide();
  state.legs.visible = !legMotion && state.performers.some(person => !hasStance(person.id));
  const showHeadings = !!facings;
  const showRoles = state.performers.some(person => person.role && !(equipmentEnabled && person.equipment));
  const assets: AssetPlacement[] = [];
  state.performers.forEach((performer, index) => {
    const point = positions[performer.id];
    const x = point ? point.x - width / 2 : 0;
    const z = point ? point.y - height / 2 : 0;
    const visible = point ? 1 : 0;
    const stance = hasStance(performer.id) ? cues?.lowerBody.get(performer.id) ?? neutralCuePose : undefined;
    const cuePose = point && stance ? sampleCueLegPose(stance) : undefined;
    const bodyHeight = -(stance?.drop ?? 0);
    const facing = facingAt(facings, performer.id);
    const angle = THREE.MathUtils.degToRad(facing ?? 0);
    const sin = Math.sin(angle), cos = Math.cos(angle);
    const bodyX = x + (cuePose?.bodyX ?? 0) * cos;
    const bodyZ = z - (cuePose?.bodyX ?? 0) * sin;
    transform.rotation.set(0, angle, 0);
    transform.scale.setScalar(visible);
    transform.position.set(bodyX, 0.91 + bodyHeight, bodyZ);
    transform.updateMatrix();
    state.bodies.setMatrixAt(index, transform.matrix);
    transform.position.y = 1.53 + bodyHeight;
    transform.updateMatrix();
    state.heads.setMatrixAt(index, transform.matrix);
    transform.position.y = 1.75 + bodyHeight;
    transform.updateMatrix();
    state.caps.setMatrixAt(index, transform.matrix);
    if (rig) {
      const pose = cuePose?.legs ?? (point && legMotion
        ? sampleLegPose(legMotion.count, point, legMotion.nextPositions[performer.id], facing, legMotion.markTime?.has(performer.id) ?? false)
        : undefined);
      rig.setLeg(index * 2, x, z, angle, pose?.[0]);
      rig.setLeg(index * 2 + 1, x, z, angle, pose?.[1]);
    }
    if (state.legs.visible) {
      transform.scale.setScalar(stance ? 0 : visible);
      for (let leg = 0; leg < 2; leg++) {
        const side = leg === 0 ? -0.105 : 0.105;
        transform.position.set(x + side * cos, 0.3, z - side * sin);
        transform.updateMatrix();
        state.legs.setMatrixAt(index * 2 + leg, transform.matrix);
      }
    }
    transform.position.set(x, 0.055, z);
    transform.rotation.set(-Math.PI / 2, 0, 0);
    transform.scale.setScalar(point && selected.has(performer.id) ? 1 : 0);
    transform.updateMatrix();
    state.rings.setMatrixAt(index, transform.matrix);

    if (showHeadings) {
      transform.position.set(x + .48 * sin, .08, z + .48 * cos);
      transform.rotation.set(Math.PI / 2, angle, 0, 'YXZ');
      transform.scale.setScalar(point && facing !== undefined ? 1 : 0);
      transform.updateMatrix();
      state.headings.setMatrixAt(index, transform.matrix);
    }

    if (point && equipmentEnabled && performer.equipment) {
      const placement = { at: [bodyX, bodyHeight, bodyZ] as const, angle, flagColor: performer.appearance?.flagColor };
      if (performer.equipment === 'flag' && cues?.flagIds.has(performer.id)) {
        const pitch = (1 - (cues.flags.get(performer.id) ?? 0)) * (50 * Math.PI / 180);
        assets.push({ ...placement, parts: flagHolderParts }, { ...placement, parts: flagPoleParts, tilt: { pivot: flagGrip, pitch } });
      } else assets.push({ ...placement, parts: carriedModels[performer.equipment] });
    }
    if (showRoles) {
      const role = equipmentEnabled && performer.equipment ? undefined : performer.role;
      transform.rotation.set(0, angle, 0);
      if (role === 'guard') {
        transform.position.set(bodyX + .35 * cos, 1.48 + bodyHeight, bodyZ - .35 * sin);
        transform.scale.set(.45 * visible, .24 * visible, .07 * visible);
      } else {
        transform.position.set(bodyX + .33 * sin, 1.05 + bodyHeight, bodyZ + .33 * cos);
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
  for (const key of meshKeys) {
    const mesh = state[key];
    if (!mesh.visible) continue;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
}

export function Stage3D({ project, positions, facings, selectedIds, onSelect, quality, onQualityChange, onReturnTo2D, recovery, cameraRequest, onCameraPreset, hideCameraPresets, previewCamera, legMotion, cueTiming, assetReview }: Stage3DProps) {
  const cameraProps=useRef({cameraRequest,onCameraPreset});cameraProps.current={cameraRequest,onCameraPreset};
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const [stadiumVisible, setStadiumVisible] = useState(false);
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
      setError(cause instanceof Error && cause.message.includes('texture') ? cause.message : currentRef.current.recovery?.unavailable ?? 'This device could not render a WebGL preview. Your drill is still available in the 2D editor.');
    }

    try {
      renderer = new THREE.WebGLRenderer({ canvas: owner.createElement('canvas'), antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(view.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.domElement.tabIndex = 0;
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.setAttribute('aria-label', `Three dimensional drill preview. Drag to orbit, right-drag to pan${currentRef.current.onSelect ? ', scroll to zoom, and click a performer to select' : ' and scroll to zoom'}. ${currentRef.current.previewCamera ? 'Use Camera view to choose an inspection angle.' : 'Use the camera buttons for front and overhead views.'}`);
      host.appendChild(renderer.domElement);
      scene.background = new THREE.Color('#141e1b');
      scene.fog = new THREE.Fog('#141e1b', 130, 240);
      const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 500);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = currentRef.current.previewCamera ? 2 : 12;
      controls.maxDistance = 175;
      controls.maxPolarAngle = Math.PI / 2 - 0.025;
      controls.target.set(0, 0, 0);
      controls.addEventListener('change', invalidate);
      cleanups.push(() => controls?.removeEventListener('change', invalidate));
      const orbit=()=>cameraProps.current.onCameraPreset?.(null);
      controls.addEventListener('start',orbit);cleanups.push(()=>controls?.removeEventListener('start',orbit));
      const setCamera = (preset: CameraPreset) => {
        if (!controls) return;
        controls.target.set(0, 0, 0);
        camera.up.set(0, 1, 0);
        const distance = Math.max(width, height * 1.7);
        if (preset === 'top') camera.position.set(0, distance * 1.17, 0.01);
        else if (preset === 'front') camera.position.set(0, distance * 0.28, distance * 0.92);
        else camera.position.set(distance * 0.13, distance * 0.69, distance * 0.77);
        camera.lookAt(controls.target);
        controls.update();
        invalidate();
        cameraProps.current.onCameraPreset?.(preset);
      };
      const setPreviewCamera = ({ position, target }: PreviewCamera) => {
        if (!controls) return;
        // A preset should land exactly even if the user clicks during damping.
        controls.enableDamping = false;
        controls.update();
        controls.target.set(...target);
        camera.position.set(...position);
        controls.update();
        controls.enableDamping = true;
        invalidate();
      };
      if (currentRef.current.previewCamera) setPreviewCamera(currentRef.current.previewCamera);
      else setCamera(cameraProps.current.cameraRequest?.preset ?? 'perspective');

      const ambient = new THREE.HemisphereLight('#eff4de', '#273229', 2.35);
      scene.add(ambient);
      const sun = new THREE.DirectionalLight('#fff8df', 2.5);
      sun.position.set(-35, 65, 25);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -width * 0.7;
      sun.shadow.camera.right = width * 0.7;
      sun.shadow.camera.top = height * 0.9;
      sun.shadow.camera.bottom = -height * 0.9;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 180;
      sun.shadow.normalBias = 0.07;
      sun.shadow.bias = -0.00015;
      scene.add(sun);

      const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: '#16241c', roughness: 1 }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.12;
      ground.receiveShadow = true;
      scene.add(ground);
      const apron = new THREE.Mesh(new THREE.BoxGeometry(width + 7, 0.16, height + 7), new THREE.MeshStandardMaterial({ color: '#435142', roughness: 1 }));
      apron.position.y = -0.04;
      apron.receiveShadow = true;
      scene.add(apron);
      const fieldTexture = makeFieldTexture(surface, owner);
      fieldTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      const field = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: fieldTexture, roughness: 1, metalness: 0 }));
      field.rotation.x = -Math.PI / 2;
      field.position.y = 0.048;
      field.receiveShadow = true;
      scene.add(field);

      // An understated home-side podium makes field orientation immediately visible.
      const podiums = new THREE.Group();
      podiums.visible = !customSurface;
      scene.add(podiums);
      const podiumMaterial = new THREE.MeshStandardMaterial({ color: '#7c8975', roughness: 0.8 });
      for (let i = 0; i < 3; i++) {
        const podium = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4 + i * 0.42, 0.8), podiumMaterial);
        podium.position.set(0, (0.4 + i * 0.42) / 2, height / 2 + 2.5 - i * 0.75);
        podium.castShadow = true;
        podium.receiveShadow = true;
        podiums.add(podium);
      }

      const performers = JSON.parse(roster) as SceneState['performers'];
      const count = performerCapacity(performers.length);
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
      const bodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.26, 0.84, 8), bodyMaterial, count);
      const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshStandardMaterial({ color: '#e6d8b9', roughness: 1 }), count);
      const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.19, 0.2, 0.26, 8), bodyMaterial, count);
      const legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.078, 0.088, 0.55, 5), new THREE.MeshStandardMaterial({ color: '#202a29', roughness: 1 }), count * 2);
      const rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.57, 0.71, 28), new THREE.MeshBasicMaterial({ color: '#8dc8ff', side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }), count);
      const headings = new THREE.InstancedMesh(new THREE.ConeGeometry(.12, .34, 4), new THREE.MeshBasicMaterial({ color: '#f5f5e8' }), count);
      const roleMarkers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#dbcca9' }), count);
      for (const mesh of [bodies, heads, caps, legs, rings, headings, roleMarkers]) {
        mesh.count = mesh === legs ? performers.length * 2 : performers.length;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = mesh !== rings && mesh !== headings;
        mesh.receiveShadow = mesh !== rings;
        scene.add(mesh);
      }
      performers.forEach((performer, index) => {
        const color = new THREE.Color(performer.color);
        bodies.setColorAt(index, performer.appearance?.costumeColor ? new THREE.Color(performer.appearance.costumeColor) : color);
        caps.setColorAt(index, color);
      });
      if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
      if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
      const setQuality = (value: Stage3DQuality) => {
        if (!renderer) return;
        renderer.shadowMap.enabled = value === 'detailed';
        renderer.shadowMap.needsUpdate = true;
        renderer.setPixelRatio(Math.min(view.devicePixelRatio || 1, value === 'detailed' ? 2 : 1));
        invalidate();
      };
      let textureSurface = surface;
      let textureImage: HTMLImageElement | undefined;
      const setFieldSurface = (next: Surface, image?: HTMLImageElement) => {
        if (!renderer || (textureSurface === next && textureImage === image)) return;
        if (!isCustomSurface(next) && textureSurface.preset === next.preset) return;
        podiums.visible = !isCustomSurface(next);
        const texture = makeFieldTexture(next, owner, image);
        texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        const previous = field.material.map;
        field.material.map = texture;
        field.material.needsUpdate = true;
        previous?.dispose();
        textureSurface = next;
        textureImage = image;
        invalidate();
      };
      const assets = new AssetResources();
      const state: SceneState = { scene, capacity: count, roster, performers, bodies, heads, caps, legs, rings, headings, roleMarkers,
        carried: new AssetBatches(scene, assets), pit: new AssetBatches(scene, assets), stadium: new AssetBatches(scene, assets), stadiumParts: stadiumParts(width, height),
        setCamera, setPreviewCamera, setQuality, setFieldSurface, invalidate, fail };
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
      function resize() {
        if (!renderer || !host) return;
        const rect = host.getBoundingClientRect();
        const w = Math.max(rect.width, 1);
        const h = Math.max(rect.height, 1);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        invalidate();
      }
      resizeObserver = new view.ResizeObserver(resize);
      resizeObserver.observe(host);
      resize();
      frames = createDemandFrames(() => {
        if (disposed || !renderer) return false;
        const changed = controls?.update() ?? false;
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
  }, [width, height]);

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
      state.pit.update(pit ?? []);
      state.stadium.update(stadiumVisible && !customSurface ? [{ parts: state.stadiumParts, at: [0, 0, 0] }] : []);
      state.invalidate();
    } catch (cause) { state.fail(cause); }
  }, [pit, stadiumVisible, customSurface, width, height]);

  useEffect(() => { if (previewCamera) sceneRef.current?.setPreviewCamera(previewCamera); }, [previewCamera]);
  useEffect(() => { sceneRef.current?.setQuality(quality); }, [quality, width, height]);
  useEffect(()=>{if(cameraRequest?.preset)sceneRef.current?.setCamera(cameraRequest.preset);},[cameraRequest?.version,width,height]);
  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    const apply = (image?: HTMLImageElement) => {
      try { state.setFieldSurface(surface, image); }
      catch (cause) { state.fail(cause); }
    };
    apply();
    if (!isCustomSurface(surface) || !surface.background) return;
    const image = hostRef.current!.ownerDocument.createElement('img');
    image.onload = () => apply(image);
    image.src = surface.background.image;
    return () => { image.onload = null; };
  }, [surface]);

  return <div className="stage-three">
    <div ref={hostRef} className="stage-three__canvas" />
    {!error && <>
      <div className="field-stage__corner"><span className="stage-status-light" /> LIVE 3D PREVIEW</div>
      <div className={hideCameraPresets?'stage-three__quality':'stage-three__controls'} role="group" aria-label={hideCameraPresets?'Rendering quality':'Camera presets'}>
        {!hideCameraPresets&&<>
        <HelpButton title="Perspective camera" aria-pressed={cameraRequest?cameraRequest.preset==='perspective':undefined} description="Reset the camera to an angled view of the entire field. Drag to orbit, right-drag to pan and scroll to zoom." type="button" onClick={() => sceneRef.current?.setCamera('perspective')}>Perspective</HelpButton>
        <HelpButton title="Front camera" aria-pressed={cameraRequest?cameraRequest.preset==='front':undefined} description="Reset the camera to the home sideline view. Drag to orbit, right-drag to pan and scroll to zoom." type="button" onClick={() => sceneRef.current?.setCamera('front')}>Front</HelpButton>
        <HelpButton title="Overhead camera" aria-pressed={cameraRequest?cameraRequest.preset==='top':undefined} description="Reset the camera to look straight down at the field. Drag to orbit, right-drag to pan and scroll to zoom." type="button" onClick={() => sceneRef.current?.setCamera('top')}>Overhead</HelpButton>
        </>}
        {!customSurface && <label className="stage-three__stadium">
          <Tooltip name="Stadium" description="Show or hide the stands and press box around the field.">
            <input type="checkbox" checked={stadiumVisible} onChange={event => setStadiumVisible(event.target.checked)} />
          </Tooltip>
          Stadium
        </label>}
        <Tooltip name="3D quality" description="Choose detailed equipment and shadows, or lightweight markers for this device." state={quality}><select aria-label="3D quality" value={quality} onChange={event => onQualityChange(event.target.value as Stage3DQuality)}><option value="detailed">Detailed · shadows</option><option value="lightweight">Lightweight · no shadows</option></select></Tooltip>
      </div>
      <div className="field-stage__hint">Drag to orbit · Scroll to zoom<span>Right-drag to pan{onSelect ? ' · Click a performer to select' : ''}</span></div>
    </>}
    {error && <div className="stage-three__fallback" role="alert">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>
      <strong>3D preview unavailable</strong>
      <p>{error}</p>
      {recovery ? recovery.actions : <HelpButton title="Return to 2D field" description="Return to the editable field view." onClick={onReturnTo2D}>Return to 2D field</HelpButton>}
    </div>}
  </div>;
}
