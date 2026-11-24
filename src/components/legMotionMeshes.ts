import * as THREE from 'three';
import type { LegPose } from './legMotion';

/** The articulated preview adds two instanced batches, independent of cast size. */
export class LegMotionMeshes {
  private segments: THREE.InstancedMesh;
  private shoes: THREE.InstancedMesh;
  private readonly transform = new THREE.Object3D();
  private readonly start = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(private readonly scene: THREE.Scene, private capacity: number) {
    const segment = new THREE.CylinderGeometry(0.063, 0.069, 1, 6);
    const shoe = new THREE.BoxGeometry(0.139, 0.09, 0.224);
    const fabric = new THREE.MeshStandardMaterial({ color: '#455450', roughness: 1 });
    const leather = new THREE.MeshStandardMaterial({ color: '#b9c9c1', roughness: 1 });
    this.segments = this.addMesh(segment, fabric, capacity * 4);
    this.shoes = this.addMesh(shoe, leather, capacity * 2);
  }

  private addMesh(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], count: number) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  begin(capacity: number, performers: number) {
    if (capacity > this.capacity) {
      const resize = (mesh: THREE.InstancedMesh, instances: number) => {
        this.scene.remove(mesh);
        mesh.dispose();
        return this.addMesh(mesh.geometry, mesh.material, instances);
      };
      this.segments = resize(this.segments, capacity * 4);
      this.shoes = resize(this.shoes, capacity * 2);
      this.capacity = capacity;
    }
    this.segments.visible = this.shoes.visible = true;
    this.segments.count = performers * 4;
    this.shoes.count = performers * 2;
  }

  hide() {
    this.segments.visible = this.shoes.visible = false;
  }

  setLeg(index: number, x: number, z: number, angle: number, pose?: LegPose) {
    const { transform, start, end, axis } = this;
    if (!pose) {
      transform.scale.setScalar(0);
      transform.updateMatrix();
      this.segments.setMatrixAt(2 * index, transform.matrix);
      this.segments.setMatrixAt(2 * index + 1, transform.matrix);
      this.shoes.setMatrixAt(index, transform.matrix);
      return;
    }
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const world = (vector: THREE.Vector3, [right, up, forward]: LegPose['hip']) =>
      vector.set(x + right * cos + forward * sin, up, z - right * sin + forward * cos);
    const segment = (instance: number) => {
      axis.subVectors(end, start);
      transform.scale.set(1, axis.length(), 1);
      transform.quaternion.setFromUnitVectors(this.up, axis.normalize());
      transform.position.copy(start).lerp(end, 0.5);
      transform.updateMatrix();
      this.segments.setMatrixAt(instance, transform.matrix);
    };

    world(start, pose.ankle);
    world(end, pose.knee);
    segment(2 * index + 1);
    start.copy(end);
    world(end, pose.hip);
    segment(2 * index);

    const [right, up, forward] = pose.ankle;
    const toeYaw = pose.toeYaw ?? 0;
    world(transform.position, [right + Math.sin(toeYaw) * 0.051, up - 0.045, forward + Math.cos(toeYaw) * 0.051]);
    transform.rotation.set(0, angle + toeYaw, 0);
    transform.scale.setScalar(1);
    transform.updateMatrix();
    this.shoes.setMatrixAt(index, transform.matrix);
  }

  commit() {
    for (const mesh of [this.segments, this.shoes]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
}
