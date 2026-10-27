import { setStartCount } from '../domain';
import { MARCHING_DIRECTIONS, validateAnalysisRules } from '../analysis/rules';
import type { CommandDefinition, CommandId } from './commands';
import type { Project, MarchingDirection } from '../types';
import type { EditorState } from './state';
const define = <I extends CommandId>(value: CommandDefinition<I>) => value;
export const canReviewProblems = (s: EditorState) => !s.ui.pendingDraft && !s.project.transactionName && (!s.ui.dialog || s.ui.dialog === 'problems') && !s.ui.selectionPreview && !s.ui.transformPreview && !s.ui.formationPreview && !s.ui.spacingPreview && !s.ui.coordinatePreview;
const available = (s: EditorState) => !s.ui.pendingDraft && !s.project.transactionName && (!s.ui.dialog || s.ui.dialog === 'analysis-rules') && !s.ui.selectionPreview && !s.ui.transformPreview && !s.ui.formationPreview && !s.ui.spacingPreview && !s.ui.coordinatePreview;
function declare(p: Project, a: { index: number; ids: string[]; direction: MarchingDirection | null }): Project {
  if (!Number.isInteger(a.index) || a.index < 1 || a.index >= p.sets.length || !a.ids.length || new Set(a.ids).size !== a.ids.length || a.ids.some(id => !p.performers.some(person => person.id === id)) || a.direction !== null && !MARCHING_DIRECTIONS.includes(a.direction)) throw new Error('Choose an existing move, explicit performers and a supported direction.');
  return { ...p, moves: p.moves.map((move, i) => { if (i !== a.index - 1) return move; const declarations = { ...move.marchingDirections }; for (const id of a.ids) { if (a.direction === null) delete declarations[id]; else declarations[id] = a.direction; } const { marchingDirections: _old, ...rest } = move; return { ...rest, ...(Object.keys(declarations).length ? { marchingDirections: declarations } : {}) }; }) };
}
export const analysisCommands = {
  'analysis.problems-open': define({ id: 'analysis.problems-open', name: 'Show-wide problems', description: 'Review all spacing and stride findings, filter by move or performer, and go to the exact count.', arguments: {}, enabled: s => available(s) && !s.ui.dialog,
    execute: c => { c.patch('playback', { playing: false }); c.patch('ui', { dialog: 'problems' }); } }),
  'analysis.problem-review': define({ id: 'analysis.problem-review', name: 'Go to problem', description: 'Pause at the problem count and highlight its performers and paths.', arguments: { epoch: 'project session', moveId: 'move ID', atCount: 'show count', ids: 'affected performer IDs' },
    enabled: (s,a) => {
      if (!a || s.ui.projectEpoch !== a.epoch || !canReviewProblems(s)) return false;
      const p = s.project.present, i = p.moves.findIndex(m => m.id === a.moveId);
      return i >= 0 && Number.isFinite(a.atCount) && a.atCount >= setStartCount(p,i) && a.atCount <= setStartCount(p,i+1) && a.ids.length > 0 && a.ids.every(id => p.performers.some(person => person.id === id));
    },
    execute: (c,a) => { const s=c.getState(), index=s.project.present.moves.findIndex(m=>m.id===a.moveId)+1;
      c.patch('playback',{playing:false,count:a.atCount,seekVersion:s.playback.seekVersion+1,rehearsalId:null});
      c.patch('selection',{activeIndex:index,selectedIds:a.ids});
      c.patch('ui',{dialog:null,workspace:'design',view:'2d',showPaths:true,castPanelOpen:false});
    } }),
  'analysis.rules-open': define({ id: 'analysis.rules-open', name: 'Analysis rules', description: 'Edit saved production, section and marching-direction spacing/stride rules.', arguments: {}, enabled: s => available(s) && !s.ui.dialog,
    execute: c => { c.patch('playback', { playing: false }); c.patch('ui', { dialog: 'analysis-rules' }); } }),
  'analysis.rules-save': define({ id: 'analysis.rules-save', name: 'Save analysis rules', description: 'Apply portable analysis rules as one undoable metadata edit.', arguments: { rules: 'ProjectAnalysisRules', declaration: 'optional current-move performer directions' }, enabled: (s,a) => available(s) && !!a?.rules,
    execute: (c,a) => { const rules = validateAnalysisRules(a.rules, new Set(c.getState().project.present.sections.map(s => s.id))); c.edit(p => { const next = { ...p, analysisRules: rules }; return a.declaration ? declare(next, a.declaration) : next; }); } }),
  'analysis.direction-set': define({ id: 'analysis.direction-set', name: 'Declare marching direction', description: 'Declare forward, backward or sideways travel for explicit performers in this move, or clear to unknown. This does not edit facing or geometry.', arguments: { index: 'destination set index', ids: 'performer IDs', direction: 'forward | backward | sideways | null' },
    enabled: (s,a) => available(s) && !!a && Number.isInteger(a.index) && a.index > 0 && a.index < s.project.present.sets.length && Array.isArray(a.ids) && a.ids.length > 0 && new Set(a.ids).size === a.ids.length && a.ids.every(id => s.project.present.performers.some(p => p.id === id)) && (a.direction === null || MARCHING_DIRECTIONS.includes(a.direction)),
    execute: (c,a) => c.edit(p => declare(p, a)) }),
};
