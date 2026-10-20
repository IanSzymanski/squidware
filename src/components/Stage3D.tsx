import { HelpButton } from '../editor/ControlHelp';
import { Tooltip } from './Tooltip';
import { selectionMembership } from '../selection';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Point, Project } from '../types';
import { createDemandFrames } from './demandFrames';
import './stages.css';

export type Stage3DQuality = 'detailed' | 'lightweight';
export interface Stage3DProps {
  project: Project;
  positions: Record<string, Point>;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  quality: Stage3DQuality;
  onQualityChange: (quality: Stage3DQuality) => void;
  onReturnTo2D: () => void;
}

type CameraPreset = 'perspective' | 'front' | 'top';
interface SceneState {
  scene: THREE.Scene;
  capacity: number;
  roster: string;
  performers: { id: string; color: string }[];
  bodies: THREE.InstancedMesh;
  heads: THREE.InstancedMesh;
  caps: THREE.InstancedMesh;
  legs: THREE.InstancedMesh;
  rings: THREE.InstancedMesh;
  setCamera: (preset: CameraPreset) => void;
  setQuality: (quality: Stage3DQuality) => void;
  setFieldPreset: (preset: Project['field']['preset']) => void;
  invalidate: () => void;
  fail: (cause: unknown) => void;
}

const meshKeys = ['bodies', 'heads', 'caps', 'legs', 'rings'] as const;
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
    state.bodies.setColorAt(index, color);
    state.caps.setColorAt(index, color);
  });
  if (state.bodies.instanceColor) state.bodies.instanceColor.needsUpdate = true;
  if (state.caps.instanceColor) state.caps.instanceColor.needsUpdate = true;
}

function makeFieldTexture(width: number, height: number, preset: Project['field']['preset']) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = Math.round(canvas.width * height / width);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The field texture could not be created.');
  context.scale(canvas.width / width, canvas.height / height);
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
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function updatePerformers(state: SceneState, positions: Record<string, Point>, selectedIds: string[], width: number, height: number) {
  const transform = new THREE.Object3D();
  const selected = new Set(selectedIds);
  state.performers.forEach((performer, index) => {
    const point = positions[performer.id];
    const x = point ? point.x - width / 2 : 0;
    const z = point ? point.y - height / 2 : 0;
    const visible = point ? 1 : 0;
    transform.rotation.set(0, 0, 0);
    transform.scale.setScalar(visible);
    transform.position.set(x, 0.91, z);
    transform.updateMatrix();
    state.bodies.setMatrixAt(index, transform.matrix);
    transform.position.y = 1.53;
    transform.updateMatrix();
    state.heads.setMatrixAt(index, transform.matrix);
    transform.position.y = 1.75;
    transform.updateMatrix();
    state.caps.setMatrixAt(index, transform.matrix);
    for (let leg = 0; leg < 2; leg++) {
      transform.position.set(x + (leg === 0 ? -0.105 : 0.105), 0.3, z);
      transform.updateMatrix();
      state.legs.setMatrixAt(index * 2 + leg, transform.matrix);
    }
    transform.position.set(x, 0.055, z);
    transform.rotation.x = -Math.PI / 2;
    transform.scale.setScalar(point && selected.has(performer.id) ? 1 : 0);
    transform.updateMatrix();
    state.rings.setMatrixAt(index, transform.matrix);
  });
  for (const mesh of [state.bodies, state.heads, state.caps, state.legs, state.rings]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
}

export function Stage3D({ project, positions, selectedIds, onSelect, quality, onQualityChange, onReturnTo2D }: Stage3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const currentRef = useRef({ positions, selectedIds, onSelect, quality });
  currentRef.current = { positions, selectedIds, onSelect, quality };
  const [error, setError] = useState<string | null>(null);
  const width = project.field.width;
  const height = project.field.height;
  const fieldPreset = project.field.preset;
  const roster = useMemo(() => {
    const colors = new Map(project.sections.map(section => [section.id, section.color]));
    return JSON.stringify(project.performers.map(performer => ({ id: performer.id, color: colors.get(performer.sectionId) ?? '#b9ed85' })));
  }, [project.performers, project.sections]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setError(null);
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
      setError(cause instanceof Error && cause.message.includes('texture') ? cause.message : 'This device could not render a WebGL preview. Your drill is still available in the 2D editor.');
    }

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.domElement.tabIndex = 0;
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.setAttribute('aria-label', 'Three dimensional drill preview. Drag to orbit, scroll to zoom, and click a performer to select. Use the camera buttons for front and overhead views.');
      host.appendChild(renderer.domElement);
      scene.background = new THREE.Color('#141e1b');
      scene.fog = new THREE.Fog('#141e1b', 130, 240);
      const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 500);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 12;
      controls.maxDistance = 175;
      controls.maxPolarAngle = Math.PI / 2 - 0.025;
      controls.target.set(0, 0, 0);
      controls.addEventListener('change', invalidate);
      cleanups.push(() => controls?.removeEventListener('change', invalidate));
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
      };
      setCamera('perspective');

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
      const fieldTexture = makeFieldTexture(width, height, fieldPreset);
      fieldTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      const field = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: fieldTexture, roughness: 1, metalness: 0 }));
      field.rotation.x = -Math.PI / 2;
      field.position.y = 0.048;
      field.receiveShadow = true;
      scene.add(field);

      // An understated home-side podium makes field orientation immediately visible.
      const podiumMaterial = new THREE.MeshStandardMaterial({ color: '#7c8975', roughness: 0.8 });
      for (let i = 0; i < 3; i++) {
        const podium = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4 + i * 0.42, 0.8), podiumMaterial);
        podium.position.set(0, (0.4 + i * 0.42) / 2, height / 2 + 2.5 - i * 0.75);
        podium.castShadow = true;
        podium.receiveShadow = true;
        scene.add(podium);
      }

      const performers = JSON.parse(roster) as { id: string; color: string }[];
      const count = performerCapacity(performers.length);
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
      const bodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.26, 0.84, 8), bodyMaterial, count);
      const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshStandardMaterial({ color: '#e6d8b9', roughness: 1 }), count);
      const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.19, 0.2, 0.26, 8), bodyMaterial, count);
      const legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.078, 0.088, 0.55, 5), new THREE.MeshStandardMaterial({ color: '#202a29', roughness: 1 }), count * 2);
      const rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.57, 0.71, 28), new THREE.MeshBasicMaterial({ color: '#8dc8ff', side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }), count);
      for (const mesh of [bodies, heads, caps, legs, rings]) {
        mesh.count = mesh === legs ? performers.length * 2 : performers.length;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = mesh !== rings;
        mesh.receiveShadow = mesh !== rings;
        scene.add(mesh);
      }
      performers.forEach((performer, index) => {
        const color = new THREE.Color(performer.color);
        bodies.setColorAt(index, color);
        caps.setColorAt(index, color);
      });
      if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
      if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
      const setQuality = (value: Stage3DQuality) => {
        if (!renderer) return;
        renderer.shadowMap.enabled = value === 'detailed';
        renderer.shadowMap.needsUpdate = true;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, value === 'detailed' ? 2 : 1));
        invalidate();
      };
      let texturePreset = fieldPreset;
      const setFieldPreset = (preset: Project['field']['preset']) => {
        if (!renderer || texturePreset === preset) return;
        const texture = makeFieldTexture(width, height, preset);
        texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        const previous = field.material.map;
        field.material.map = texture;
        field.material.needsUpdate = true;
        previous?.dispose();
        texturePreset = preset;
        invalidate();
      };
      const state: SceneState = { scene, capacity: count, roster, performers, bodies, heads, caps, legs, rings, setCamera, setQuality, setFieldPreset, invalidate, fail };
      sceneRef.current = state;
      updatePerformers(state, currentRef.current.positions, currentRef.current.selectedIds, width, height);

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
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
        const bounds = renderer.domElement.getBoundingClientRect();
        pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects([state.bodies, state.heads, state.caps], false)[0];
        const id = hit?.instanceId === undefined ? undefined : state.performers[hit.instanceId]?.id;
        const current = currentRef.current;
        if (!id) { if (!start.shift) current.onSelect([]); return; }
        current.onSelect(start.shift ? selectionMembership(current.selectedIds).has(id) ? current.selectedIds.filter(selected => selected !== id) : [...current.selectedIds, id] : [id]);
      };
      const onContextLost = (event: Event) => {
        event.preventDefault();
        if (!disposed) {
          cleanup();
          setError('The graphics context was interrupted. Return to 2D and open 3D again to reload the preview.');
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
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      resize();
      frames = createDemandFrames(() => {
        if (disposed || !renderer) return false;
        const changed = controls?.update() ?? false;
        renderer.render(scene, camera);
        return changed;
      }, fail);
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
      updatePerformers(state, positions, selectedIds, width, height);
      state.invalidate();
    } catch (cause) { state.fail(cause); }
  }, [positions, selectedIds, width, height, roster]);

  useEffect(() => { sceneRef.current?.setQuality(quality); }, [quality, width, height]);
  useEffect(() => {
    const state = sceneRef.current;
    try { state?.setFieldPreset(fieldPreset); }
    catch (cause) { state?.fail(cause); }
  }, [fieldPreset, width, height]);

  return <div className="stage-three">
    <div ref={hostRef} className="stage-three__canvas" />
    {!error && <>
      <div className="field-stage__corner"><span className="stage-status-light" /> LIVE 3D PREVIEW</div>
      <div className="stage-three__controls" role="group" aria-label="Camera presets">
        <HelpButton title="Perspective camera" description="Reset the camera to an angled view of the entire field." type="button" onClick={() => sceneRef.current?.setCamera('perspective')}>Perspective</HelpButton>
        <HelpButton title="Front camera" description="Reset the camera to the home sideline view." type="button" onClick={() => sceneRef.current?.setCamera('front')}>Front</HelpButton>
        <HelpButton title="Overhead camera" description="Reset the camera to look straight down at the field." type="button" onClick={() => sceneRef.current?.setCamera('top')}>Overhead</HelpButton>
        <Tooltip name="3D quality" description="Choose detailed shadows or lightweight rendering for this device." state={quality}><select aria-label="3D quality" value={quality} onChange={event => onQualityChange(event.target.value as Stage3DQuality)}><option value="detailed">Detailed · shadows</option><option value="lightweight">Lightweight · no shadows</option></select></Tooltip>
      </div>
      <div className="field-stage__hint">Drag to orbit · Scroll to zoom<span>Right-drag to pan · Click a performer to select</span></div>
    </>}
    {error && <div className="stage-three__fallback" role="alert">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>
      <strong>3D preview unavailable</strong>
      <p>{error}</p>
      <HelpButton title="Return to 2D field" description="Return to the editable field view." onClick={onReturnTo2D}>Return to 2D field</HelpButton>
    </div>}
  </div>;
}
