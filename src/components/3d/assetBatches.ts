import * as THREE from 'three';
import { DEFAULT_FLAG_COLOR } from '../../equipment';
import { DEFAULT_FABRIC, type AssetPart, type AssetPlacement } from './assetModels';

type Shape = AssetPart['shape'];
const shapes: Shape[] = ['box', 'cylinder', 'flare'];
type Batch = { mesh: THREE.InstancedMesh; count: number };

export class AssetBatches {
  private readonly batches = new Map<Shape, Batch>();
  private readonly parts = new WeakMap<AssetPart, THREE.Matrix4>();
  private readonly root = new THREE.Object3D();
  private readonly part = new THREE.Object3D();
  private readonly world = new THREE.Matrix4();
  private readonly tilt = new THREE.Matrix4();
  private readonly pivot = new THREE.Vector3();
  private readonly correction = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly direction = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor(private readonly parent: THREE.Object3D, private readonly resources: AssetResources) {}

  update(instances: readonly AssetPlacement[]) {
    const counts = { box: 0, cylinder: 0, flare: 0 };
    for (const { parts } of instances) for (const part of parts) counts[part.shape]++;

    for (const shape of shapes) {
      const count = counts[shape];
      let batch = this.batches.get(shape);
      if (count > (batch?.mesh.instanceMatrix.count ?? 0)) {
        if (batch) {
          this.parent.remove(batch.mesh);
          batch.mesh.dispose();
        }
        const mesh = new THREE.InstancedMesh(this.resources.geometry(shape), this.resources.material, 2 ** Math.ceil(Math.log2(count)));
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        this.parent.add(mesh);
        batch = { mesh, count: 0 };
        this.batches.set(shape, batch);
      }
      if (batch) {
        batch.count = 0;
        batch.mesh.count = count;
        batch.mesh.visible = count > 0;
      }
    }

    for (const { parts, at, angle, flagColor, tilt, scale } of instances) {
      this.root.position.set(...at);
      this.root.rotation.y = angle ?? 0;
      if (scale) this.root.scale.set(...scale);
      else this.root.scale.setScalar(1);
      this.root.updateMatrix();
      if (tilt) {
        this.tilt.makeRotationX(tilt.pitch);
        this.pivot.set(...tilt.pivot);
        this.correction.copy(this.pivot).applyMatrix4(this.tilt);
        this.tilt.setPosition(this.correction.subVectors(this.pivot, this.correction));
        this.root.matrix.multiply(this.tilt);
      }
      for (const part of parts) {
        const batch = this.batches.get(part.shape)!;
        const index = batch.count++;
        batch.mesh.setMatrixAt(index, this.world.multiplyMatrices(this.root.matrix, this.localMatrix(part)));
        batch.mesh.setColorAt(index, this.color.set(part.color === DEFAULT_FABRIC ? flagColor ?? DEFAULT_FLAG_COLOR : part.color));
      }
    }

    for (const { mesh } of this.batches.values()) if (mesh.visible) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private localMatrix(part: AssetPart): THREE.Matrix4 {
    let matrix = this.parts.get(part);
    if (!matrix) {
      this.part.position.set(...part.at);
      this.part.scale.set(...part.size);
      if (part.direction) this.part.quaternion.setFromUnitVectors(this.up, this.direction.set(...part.direction).normalize());
      else this.part.quaternion.identity();
      this.part.updateMatrix();
      matrix = this.part.matrix.clone();
      this.parts.set(part, matrix);
    }
    return matrix;
  }
}

export class AssetResources {
  private readonly geometries = new Map<Shape, THREE.BufferGeometry>();
  private sharedMaterial?: THREE.MeshStandardMaterial;

  get material() {
    return this.sharedMaterial ??= new THREE.MeshStandardMaterial({ color: '#fff', roughness: .84 });
  }

  geometry(shape: Shape): THREE.BufferGeometry {
    let geometry = this.geometries.get(shape);
    if (!geometry) {
      geometry = shape === 'box' ? new THREE.BoxGeometry() : new THREE.CylinderGeometry(.5, shape === 'flare' ? .15 : .5, 1, 8);
      this.geometries.set(shape, geometry);
    }
    return geometry;
  }
}
