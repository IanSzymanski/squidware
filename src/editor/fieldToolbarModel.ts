import { commandRegistry, type CommandArguments, type CommandDefinition, type CommandId } from './commands';
import { commandUnavailable, type CommandInvocation } from './paletteCommands';
import { isAtActiveSet } from './editMode';
import type { EditorState } from './state';

export interface FieldAction {
  key: string; invocation: CommandInvocation; label: string; title: string; icon: string;
  active?: boolean; disabledReason: string | null;
}
export function fieldAction<I extends CommandId>(state: EditorState, id: I, args: CommandArguments[I], icon: string,
  label = commandRegistry[id].name, title = label, active?: boolean): FieldAction {
  const invocation = {id,args} as CommandInvocation;
  const definition = commandRegistry[id] as unknown as CommandDefinition<CommandId>;
  return {key:id+JSON.stringify(args??''),invocation,icon,label,title,active,
    disabledReason:definition.enabled(state,args) ? null : commandUnavailable(state,invocation) ?? 'This action is unavailable in the current context.'};
}
export function fieldToolbar(state: EditorState) {
  const action = <I extends CommandId>(id:I,args:CommandArguments[I],icon:string,label?:string,title?:string,active?:boolean) => fieldAction(state,id,args,icon,label,title,active);
  const selection = state.selection.selectedIds.length;
  const display = [action('display.paths',undefined,'previous','Paths from previous set','Show paths from previous set',state.ui.showPaths),
    action('display.next-paths',undefined,'next','Paths to next set','Show paths to next set',state.ui.showNextPaths),
    action('display.snap',undefined,'snap','Snap to grid',undefined,state.ui.snap),
    action('dialog.open',{dialog:'snapping'},'settings','Grid and snapping'),
    action('display.grid',undefined,'grid','Field grid','Show field grid',state.ui.showGrid),
    action('display.labels',undefined,'labels','Labels','Show performer labels',state.ui.showLabels),
    action('field.zoom-out',undefined,'minus','Zoom out'),action('field.zoom-in',undefined,'plus','Zoom in'),action('field.fit',undefined,'fit','Fit field')];
  const preview = state.ui.selectionPreview ? 'selection' : state.ui.transformPreview ? 'transform' : state.ui.formationPreview ? 'formation' : state.ui.spacingPreview ? 'spacing' : state.ui.coordinatePreview ? 'coordinates' : null;
  if (preview) return {context:'preview',primary:[action(`${preview}.apply`,undefined,'apply','Apply',commandRegistry[`${preview}.apply`].name),action(`${preview}.cancel`,undefined,'cancel','Cancel',commandRegistry[`${preview}.cancel`].name)],secondary:[action('tool.box',undefined,'select','Select','Select performers',state.ui.tool==='select'),action('tool.pan',undefined,'pan','Pan','Pan field',state.ui.tool==='pan'),...display]};
  if (state.ui.view === '3d') return {context:'3d',primary:([
    ['perspective','Perspective'],['front','Front'],['top','Overhead']] as const).map(([preset,label]) => action('view.camera',{preset},'camera',label,`${label} camera`,state.ui.camera.preset===preset)),secondary:[]};
  if (state.playback.playing) return {context:'playback',primary:[action('playback.toggle',undefined,'pause','Pause','Pause playback')],secondary:[action('playback.count-previous',undefined,'previous','Previous count'),action('playback.count-next',undefined,'next','Next count'),...display]};
  if (!isAtActiveSet(state) || state.playback.rehearsalId) return {context:'scrub',primary:[action('set.select',{index:state.selection.activeIndex},'select','Return to set','Return to this set to edit')],secondary:display};
  const select = [action('tool.box',undefined,'select','Select','Select performers',state.ui.tool==='select'),action('tool.lasso',undefined,'lasso','Lasso','Lasso selection',state.ui.tool==='lasso'),
    action('selection.tools',undefined,'selection','Selection tools','Selection tools and groups'),action('tool.pan',undefined,'pan','Pan','Pan field',state.ui.tool==='pan'),
    action(selection ? 'selection.clear':'selection.all',undefined,selection?'cancel':'all',selection?'Clear selection':'Select all performers')];
  const editing = [action('transform.preview',{},'rotate','Rotate','Rotate selection'),action('formation.preview',{},'shape','Shape','Shape selection'),
    action('spacing.preview',undefined,'align','Align','Align selection'),action('coordinates.preview',{},'place','Coordinates','Enter coordinates'),
    action('transform.preview',{operation:'across-50'},'mirror','Mirror','Mirror selection')];
  const single = [action('path.open',undefined,'path','Edit performer path','Edit performer path'),action('path.draw-open',undefined,'draw','Draw performer path','Draw performer path'),action('schedule.open',undefined,'timing','Edit movement timing','Edit movement timing')];
  const move=action('selection.move-controls',undefined,'move','Move','Move selection');
  const shared = [action('routes.open',undefined,'route','Shared routes'),action('path.operations-open',undefined,'operations','Move operations'),action('templates.open',undefined,'saved','Saved formations','Browse saved formations')];
  const groups = [action('group.open',{},'group','Group route movement','Edit group route movement'),action('transition.open',undefined,'transition','Formation transition','Edit formation transition')];
  const savedGroups = (state.project.present.moves[state.selection.activeIndex-1]?.groupMotions??[]).map(g => action('group.open',{id:g.id},'group',`Edit group ${g.name}`,`Edit group ${g.name}`));
  if (!selection) return {context:'selection',primary:select.slice(0,4),secondary:[select[4],move,...editing,...single,...groups,...shared,...savedGroups,...display]};
  if (selection===1) return {context:'performer',primary:[editing[3],...single],secondary:[move,...editing.slice(0,3),editing[4],...select,...shared,...savedGroups,...display]};
  return {context:'group',primary:[move,...editing.slice(0,3)],secondary:[editing[3],editing[4],...groups,...select,...shared,...savedGroups,...display]};
}
