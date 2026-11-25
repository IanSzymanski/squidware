import { describe, expect, it } from 'vitest';
import { Box3, Color, InstancedMesh, Matrix4, Scene, Vector3 } from 'three';
import { AssetBatches, AssetResources } from './components/3d/assetBatches';
import { carriedModels, frontEnsembleModels, type AssetPart } from './components/3d/assetModels';
import { stadiumParts } from './components/3d/stadium';
import { createDemoProject, parseProject, sampleProject, serializeProject } from './domain';
import { equipmentKey, guardCatalog, instrumentCatalog, resolveEquipment } from './equipment';
import { frontEnsembleCatalog, type FrontEnsembleModel } from './frontEnsemble';
import { createEditorStore } from './editor/store';

describe('carried equipment', () => {
  it('resolves aliases, selection overrides, role conflicts and generic markers', () => {
    expect(equipmentKey('sousaphone')).toBe('tuba');
    expect(equipmentKey('sabre')).toBe('guard-saber');
    expect(equipmentKey('constructor')).toBeUndefined();
    expect(resolveEquipment(undefined, 'trumpet')).toEqual({ key: 'trumpet', role: 'instrument' });
    expect(resolveEquipment({ role: 'guard' }, 'trumpet')).toEqual({ role: 'guard' });
    expect(resolveEquipment({ role: 'instrument', equipment: 'flag' }, 'trumpet')).toEqual({ key: 'flag', role: 'guard' });
    expect(resolveEquipment({ equipment: 'none' }, 'trumpet')).toEqual({ role: undefined });
    expect(resolveEquipment({ equipment: 'future-instrument' })).toEqual({ role: 'instrument' });
    expect(resolveEquipment({ role: 'guard', equipment: 'future-guard' })).toEqual({ role: 'guard' });
  });

  it('writes v14 for equipment, keeps identities and positions, and restores metadata through undo and reopen', () => {
    const store = createEditorStore(createDemoProject());
    const project = store.getState().project.present;
    const person = project.performers[0];
    expect(store.dispatch('section.update', { id: person.sectionId, update: { equipment: 'soprano' } })).toBe(true);
    expect(store.dispatch('performer.appearance', { id: person.id, equipment: 'flag', flagColor: '#abcdef' })).toBe(true);
    const edited = store.getState().project.present;
    expect(edited.sets).toBe(project.sets);
    expect(edited.moves).toBe(project.moves);
    expect(edited.performers[0].id).toBe(person.id);
    expect(sampleProject(edited, 3.5)).toEqual(sampleProject(project, 3.5));
    expect(JSON.parse(serializeProject(edited)).schemaVersion).toBe(14);
    expect(parseProject(serializeProject(edited))).toEqual(edited);
    expect(store.dispatch('performer.appearance', { id: person.id, flagColor: 'lime' })).toBe(false);
    expect(store.dispatch('section.update', { id: person.sectionId, update: { equipment: 'BAD' } })).toBe(false);
    expect(store.dispatch('history.undo')).toBe(true);
    expect(store.getState().project.present.performers[0].appearance).toBeUndefined();
    expect(store.getState().project.present.sections[0].equipment).toBe('trumpet');
    expect(store.dispatch('history.redo')).toBe(true);
    expect(store.getState().project.present).toEqual(edited);
    expect(store.dispatch('performer.appearance', { id: person.id, equipment: null, flagColor: null })).toBe(true);
    expect(store.dispatch('section.update', { id: person.sectionId, update: { equipment: null } })).toBe(true);
    expect(JSON.parse(serializeProject(store.getState().project.present)).schemaVersion).toBe(JSON.parse(serializeProject(project)).schemaVersion);
  });

  it('has positive, finite model dimensions and keeps stadium geometry outside the field', () => {
    expect(Object.keys(carriedModels).sort()).toEqual([...Object.keys(instrumentCatalog), ...Object.keys(guardCatalog)].sort());
    const models = [...Object.values(carriedModels), ...Object.values(frontEnsembleModels)];
    for (const part of models.flat()) {
      expect(part.at.every(Number.isFinite)).toBe(true);
      expect(part.size.every(size => Number.isFinite(size) && size > 0)).toBe(true);
    }
    const field = { width: 100, height: 160 / 3 };
    for (const { at, size } of stadiumParts(field.width, field.height)) {
      expect(Math.abs(at[0]) - size[0] / 2 > field.width / 2 || Math.abs(at[2]) - size[2] / 2 > field.height / 2).toBe(true);
    }
  });

  it('encloses every model in its default planning dimensions around the same ground origin', () => {
    const scene = new Scene();
    const batches = new AssetBatches(scene, new AssetResources());
    const matrix = new Matrix4();
    for (const [key, parts] of Object.entries(frontEnsembleModels)) {
      batches.update([{ parts, at: [0, 0, 0] }]);
      const bounds = new Box3();
      for (const mesh of scene.children as InstancedMesh[]) {
        mesh.geometry.computeBoundingBox();
        for (let index = 0; index < mesh.count; index++) {
          mesh.getMatrixAt(index, matrix);
          bounds.union(mesh.geometry.boundingBox!.clone().applyMatrix4(matrix));
        }
      }
      const { width, depth, height } = frontEnsembleCatalog[key as FrontEnsembleModel];
      expect(Math.max(-bounds.min.x, bounds.max.x) * 2, key).toBeLessThanOrEqual(width);
      expect(Math.max(-bounds.min.z, bounds.max.z) * 2, key).toBeLessThanOrEqual(depth);
      expect(bounds.min.y, key).toBeGreaterThanOrEqual(-1e-6);
      expect(bounds.max.y, key).toBeLessThanOrEqual(height);
    }
  });

  it('rotates attachments in yard space and shares batches across repeated models', () => {
    const scene = new Scene();
    const resources = new AssetResources();
    const batches = new AssetBatches(scene, resources);
    const parts: AssetPart[] = [{ shape: 'box', at: [1, 2, 3], size: [1, 1, 1], color: 'flag-color' }];
    batches.update([{ parts, at: [10, 0, 20], angle: Math.PI / 2, flagColor: '#123456' }]);
    const single = scene.children[0] as InstancedMesh;
    const matrix = new Matrix4();
    single.getMatrixAt(0, matrix);
    const world = new Vector3().setFromMatrixPosition(matrix);
    expect(world.x).toBeCloseTo(13);
    expect(world.y).toBeCloseTo(2);
    expect(world.z).toBeCloseTo(19);
    const tint = new Color();
    single.getColorAt(0, tint);
    expect(tint.getHexString()).toBe('123456');
    const geometry = single.geometry;
    batches.update(Array.from({ length: 500 }, () => ({ parts, at: [0, 0, 0] })));
    expect(scene.children).toHaveLength(1);
    const full = scene.children[0] as InstancedMesh;
    expect(full.count).toBe(500);
    expect(full.geometry).toBe(geometry);
    batches.update([]);
    expect(full.visible).toBe(false);
    expect(full.count).toBe(0);
  });
});
