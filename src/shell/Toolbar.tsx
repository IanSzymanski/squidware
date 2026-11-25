import type { ReactNode } from 'react';
import { AlignHorizontalJustifyCenter, Bookmark, Box, Check, ChevronDown, Clapperboard, Clock3, Columns2, Eye, FlipHorizontal2, Focus, Grid2X2, Grid3X3, Hand, Lasso, ListFilter, Magnet, MapPin, Maximize, MoreHorizontal, MousePointer2, Package, PanelRight, Pencil, Play, Pause, RotateCw, Route, Scissors, Shapes, SlidersHorizontal, Sparkles, Tags, TriangleAlert, Users, Waypoints, X, ZoomIn, ZoomOut } from 'lucide-react';
import { HelpButton } from '../editor/ControlHelp';
import { commandRegistry, type CommandArguments, type CommandId } from '../editor/commands';
import { fieldAction, type FieldAction } from '../editor/fieldToolbarModel';
import { Popout3DButton } from '../editor/Popout3D';
import type { EditorController } from '../editor/useEditorController';
import { fieldViews } from '../workspaces';
import { Menu, type MenuEntry } from '../ui/Menu';
import { ArcIcon, BezierIcon, BlockIcon, CircleIcon, LineIcon, PathsFromIcon, PathsToIcon, ScatterIcon, WaveIcon } from '../ui/icons';
import type { ShellLayout } from './useShellLayout';

const PREVIEW_NAMES = { selection: 'Selection', transform: 'Transform', formation: 'Formation', spacing: 'Align and space', coordinates: 'Coordinates' } as const;
type PreviewKind = keyof typeof PREVIEW_NAMES;

/** The one tool strip above the field. Its tools stay where they are; they enable and disable with context. */
export function Toolbar({ controller: c, layout }: { controller: EditorController; layout: ShellLayout }) {
  const state = c.store.getState();
  const action = <I extends CommandId>(id: I, args: CommandArguments[I], label?: string, title?: string, active?: boolean) => fieldAction(state, id, args, '', label, title, active);
  const run = (a: FieldAction) => { c.dispatch(a.invocation.id, a.invocation.args as never); };
  const item = (a: FieldAction, icon: ReactNode, extra: Partial<Extract<MenuEntry, { label: string }>> = {}): MenuEntry => ({
    label: a.label, icon, command: a.invocation.id, disabled: !!a.disabledReason, disabledReason: a.disabledReason ?? undefined, onSelect: () => run(a), ...extra,
  });
  const tool = (a: FieldAction, icon: ReactNode, options: { label?: boolean; description?: string; state?: string; className?: string } = {}) =>
    <HelpButton key={a.key} command={a.invocation.id === 'transform.preview' && a.invocation.args.operation === 'across-50' ? 'transform.mirror' : a.invocation.id}
      title={a.title} description={options.description} state={options.state} active={a.active}
      disabled={!!a.disabledReason} disabledReason={a.disabledReason ?? undefined} data-command={a.invocation.id}
      className={`tool${a.active ? ' active' : ''}${options.label ? ' tool--labelled' : ''}${options.className ? ` ${options.className}` : ''}`} onClick={() => run(a)}>
      {icon}{options.label && <span className="tool-label">{a.label}</span>}
    </HelpButton>;

  const preview: PreviewKind | null = c.selectionPreview ? 'selection' : c.transformPreview ? 'transform' : c.formationPreview ? 'formation' : c.spacingPreview ? 'spacing' : c.coordinatePreview ? 'coordinates' : null;
  const session = c.formationPreview;
  const count = c.selectedIds.length;
  const three = c.view === '3d';
  const rehearse = layout.mode === 'rehearse';

  // View controls on the right are shared by every state of the strip.
  const labelsState = !c.showLabels ? 'hidden' : c.selectionLabelsOnly ? 'selected' : 'all';
  const setLabels = (next: 'all' | 'selected' | 'hidden') => { c.setShowLabels(next !== 'hidden'); c.setSelectionLabelsOnly(next === 'selected'); };
  const zoomIn = action('field.zoom-in', undefined), zoomOut = action('field.zoom-out', undefined), fit = action('field.fit', undefined);
  const grid = action('display.grid', undefined), snap = action('display.snap', undefined), snapping = action('dialog.open', { dialog: 'snapping' });
  const focus = action('layout.focus', undefined);
  const viewMenu: MenuEntry[] = [
    { type: 'heading', label: 'Performer labels' },
    { label: 'All labels', icon: <Tags size={15} />, checked: labelsState === 'all', keepOpen: true, onSelect: () => setLabels('all') },
    { label: 'Selected only', icon: <Tags size={15} />, checked: labelsState === 'selected', keepOpen: true, onSelect: () => setLabels('selected') },
    { label: 'Hidden', icon: <Tags size={15} />, checked: labelsState === 'hidden', keepOpen: true, onSelect: () => setLabels('hidden') },
    { type: 'separator' },
    item(grid, <Grid3X3 size={15} />, { label: 'Field grid', checked: c.showGrid, keepOpen: true }),
    item(snap, <Magnet size={15} />, { label: 'Snap to grid', checked: c.snap, keepOpen: true }),
    item(snapping, <SlidersHorizontal size={15} />, { label: 'Grid and snapping…', command: undefined, description: 'Choose the step grid and what direct edits snap to.' }),
    { type: 'separator' },
    item(zoomIn, <ZoomIn size={15} />, { label: 'Zoom in', keepOpen: true }),
    item(zoomOut, <ZoomOut size={15} />, { label: 'Zoom out', keepOpen: true }),
    item(fit, <Maximize size={15} />, { label: 'Fit field' }),
    { type: 'separator' },
    item(focus, <Focus size={15} />, { label: layout.focusMode ? 'Exit focus' : 'Focus field', checked: layout.focusMode }),
  ];
  const viewSwitch = <div className="segmented view-switch" role="group" aria-label="Field view">
    {fieldViews.map(view => {
      const a = action('view.select', { view }, view === '2d' ? '2D' : view === '3d' ? '3D' : 'Split', view === '2d' ? '2D field' : view === '3d' ? '3D preview' : 'Split review', c.view === view);
      return <HelpButton key={view} command="view.select" showShortcut={view !== 'split'} title={a.title} description={view === '2d' ? 'Edit on the flat field.' : view === '3d' ? 'Watch from the stands in 3D.' : 'Edit in 2D beside a live 3D preview.'}
        aria-pressed={c.view === view} disabled={!!a.disabledReason} disabledReason={a.disabledReason ?? undefined} data-toolbar-item={`view-${view}`} onClick={() => run(a)}>
        {view === '2d' ? <Grid2X2 size={14} /> : view === '3d' ? <Box size={14} /> : <Columns2 size={14} />}<span>{a.label}</span>
      </HelpButton>;
    })}
  </div>;
  const panelToggle = <HelpButton pointerPassThrough title={layout.panelVisible ? 'Hide side panel' : 'Show side panel'} description="Show or hide the properties and Cast panel." className="tool" active={layout.panelVisible}
    disabled={layout.locked && layout.docked} disabledReason="Finish or cancel the current input or preview first." onClick={layout.togglePanel}><PanelRight size={17} /></HelpButton>;
  const end = (extra?: ReactNode) => <div className="toolbar-end">
    {extra}
    {!three && <Menu label="View options" description="Labels, grid, snapping, zoom and focus." className="tool tool--labelled" align="end" items={viewMenu}><Eye size={16} /><span className="tool-label">View</span><ChevronDown size={12} /></Menu>}
    {viewSwitch}
    <Popout3DButton controller={c} toolbarItem="popout" />
    <span className="divider-vertical" />
    {panelToggle}
  </div>;
  const bar = (context: string, children: ReactNode) => <div className="canvas-toolbar field-command-toolbar toolbar" role="toolbar" aria-label="Field tools" aria-orientation="horizontal" data-context={context}>{children}</div>;

  // A preview owns the strip: what is being previewed, and the two ways out.
  if (preview) {
    const apply = action(`${preview}.apply`, undefined, 'Apply', commandRegistry[`${preview}.apply`].name);
    const cancel = action(`${preview}.cancel`, undefined, 'Cancel', commandRegistry[`${preview}.cancel`].name);
    const subject = preview === 'selection' ? `${c.selectionPreview!.ids.length} included` : `${count} performer${count === 1 ? '' : 's'}`;
    return bar('preview', <>
      <div className="toolbar-preview" role="status">
        <span className="toolbar-preview-dot" />
        <strong>{preview === 'formation' && session ? `${session.scatter ? 'Scatter' : session.bezier ? 'Bézier' : session.kind === 'curve' ? 'Wave' : session.kind[0].toUpperCase() + session.kind.slice(1)} formation` : PREVIEW_NAMES[preview]}</strong>
        <span>{subject} · preview</span>
      </div>
      <div className="toolbar-commit">
        <HelpButton command={cancel.invocation.id} title={cancel.title} className="button subtle" disabled={!!cancel.disabledReason} disabledReason={cancel.disabledReason ?? undefined} data-command={cancel.invocation.id} onClick={() => run(cancel)}><X size={14} />Cancel<kbd>Esc</kbd></HelpButton>
        <HelpButton command={apply.invocation.id} title={apply.title} className="button primary field-action--apply" disabled={!!apply.disabledReason} disabledReason={apply.disabledReason ?? undefined} data-command={apply.invocation.id} onClick={() => run(apply)}><Check size={14} />Apply<kbd>↵</kbd></HelpButton>
      </div>
      {end()}
    </>);
  }

  // Rehearsing and the 3D view: cameras and review, no editing tools.
  if (three || rehearse) {
    const cameras = ([['perspective', 'Perspective'], ['front', 'Front'], ['press-box', 'Press box'], ['top', 'Overhead']] as const)
      .map(([preset, label]) => action('view.camera', { preset }, label, `${label} camera`, state.ui.camera.preset === preset && !state.ui.camera.savedId));
    const play = action('playback.toggle', undefined, c.playing ? 'Pause' : 'Play', c.playing ? 'Pause playback' : 'Play show');
    const passages = action('rehearsal.open', undefined, 'Passages', 'Rehearsal passages');
    const problems = action('analysis.problems-open', undefined, 'Problems', 'Show-wide problems');
    const video = action('dialog.open', { dialog: 'video-export' }, 'Record video', 'Rehearsal video');
    return bar(three ? '3d' : 'rehearsal', <>
      <div className="toolbar-group">
        {tool(play, c.playing ? <Pause size={15} /> : <Play size={15} />, { label: true, className: 'tool--play' })}
      </div>
      {three && <><span className="divider-vertical" /><div className="toolbar-group stage-three__controls" role="group" aria-label="Camera">
        <span className="toolbar-caption">Camera</span>
        <div className="segmented">{cameras.map(a => <HelpButton key={a.key} command="view.camera" showShortcut={false} title={a.title} aria-pressed={!!a.active} disabled={!!a.disabledReason} disabledReason={a.disabledReason ?? undefined} data-command="view.camera" onClick={() => run(a)}>{a.label}</HelpButton>)}</div>
      </div></>}
      <span className="divider-vertical" />
      <div className="toolbar-group">
        {tool(passages, <Bookmark size={15} />, { label: true })}
        {tool(problems, <TriangleAlert size={15} />, { label: true })}
        {tool(video, <Clapperboard size={15} />, { label: true, description: 'Render a WebM video of a set range with a chosen camera angle.' })}
      </div>
      {end()}
    </>);
  }

  // Writing: the pointer, the shapes, the arrangers, then everything deeper by name.
  const select = action('tool.box', undefined, 'Select', 'Select performers', c.tool === 'select');
  const lasso = action('tool.lasso', undefined, 'Lasso', 'Lasso selection', c.tool === 'lasso');
  const pan = action('tool.pan', undefined, 'Pan', 'Pan field', c.tool === 'pan');
  const shapes = ([['line', 'Line', <LineIcon size={20} />], ['arc', 'Arc', <ArcIcon size={20} />], ['circle', 'Circle', <CircleIcon size={20} />], ['block', 'Block', <BlockIcon size={20} />], ['curve', 'Wave', <WaveIcon size={20} />]] as const)
    .map(([kind, label, icon]) => ({ kind, icon, action: action('formation.preview', { kind }, label, `${label} formation`) }));
  const bezier = action('formation.bezier', { wave: false }, 'Bézier curve'), bezierWave = action('formation.bezier', { wave: true }, 'Bézier wave'), scatter = action('formation.scatter', undefined, 'Scatter…');
  const saved = action('templates.open', undefined, 'Saved formations…');
  const align = action('spacing.preview', undefined, 'Align', 'Align and space');
  const rotate = action('transform.preview', {}, 'Rotate', 'Rotate and scale');
  const mirror = action('transform.preview', { operation: 'across-50' }, 'Mirror', 'Mirror across the 50');
  const mirrorFrontBack = action('transform.preview', { operation: 'front-back' }, 'Mirror front / back');
  const place = action('coordinates.preview', {}, 'Place', 'Enter coordinates');
  const staging = action('staging.open', undefined, 'Props', 'Staging props');
  const shapeHelp = count ? undefined : 'Select performers first: click a dot, drag a box or pick a section.';
  const groups = c.project.moves[c.index - 1]?.groupMotions ?? [];

  const selectMenu: MenuEntry[] = [
    item(action('selection.all', undefined), <Users size={15} />, { label: 'Select all' }),
    item(action('selection.clear', undefined), <X size={15} />, { label: 'Clear selection' }),
    item(action('selection.invert', undefined), <ListFilter size={15} />, { label: 'Invert selection' }),
    { type: 'heading', label: 'Sections' },
    ...c.project.sections.map((section): MenuEntry => {
      const a = action('selection.section', { id: section.id });
      return { key: section.id, label: section.name, icon: <i className="swatch" style={{ background: section.color }} />, hint: String(c.sectionMembers.get(section.id)?.length ?? 0), command: undefined, disabled: !!a.disabledReason, disabledReason: a.disabledReason ?? undefined, onSelect: () => run(a) };
    }),
    ...(c.project.selectionGroups?.length ? [{ type: 'heading', label: 'Saved groups' } as MenuEntry, ...c.project.selectionGroups.map((group): MenuEntry => {
      const a = action('group.select', { id: group.id });
      return { key: group.id, label: group.name, icon: <Users size={15} />, hint: String(group.performerIds.length), disabled: !!a.disabledReason, disabledReason: a.disabledReason ?? undefined, onSelect: () => run(a) };
    })] : []),
    { type: 'separator' },
    item(action('selection.tools', undefined), <SlidersHorizontal size={15} />, { label: 'Rank, file and saved groups…', description: 'Select a rank or file, type a lasso, and save named groups.' }),
  ];
  const moreShapes: MenuEntry[] = [
    item(bezier, <BezierIcon size={16} />), item(bezierWave, <WaveIcon size={16} />), item(scatter, <ScatterIcon size={16} />),
    { type: 'separator' },
    item(saved, <Shapes size={15} />, { command: undefined, description: 'Apply a formation from your template library.' }),
    ...(c.activeSet.liveFormations?.length ? [{ type: 'heading', label: 'Editable on this set' } as MenuEntry, ...c.activeSet.liveFormations.map((live): MenuEntry => {
      const a = action('live.edit', { id: live.id });
      return { key: live.id, label: live.name, icon: <Sparkles size={15} />, hint: `${live.members.length}`, disabled: !!a.disabledReason, disabledReason: a.disabledReason ?? undefined, onSelect: () => run(a) };
    })] : []),
  ];
  const motionMenu: MenuEntry[] = [
    { type: 'heading', label: 'One performer' },
    item(action('path.open', undefined), <Waypoints size={15} />, { label: 'Edit travel path…' }),
    item(action('path.draw-open', undefined), <Pencil size={15} />, { label: 'Draw travel path' }),
    item(action('schedule.open', undefined), <Clock3 size={15} />, { label: 'Movement timing' }),
    { type: 'heading', label: 'Groups' },
    item(action('group.open', {}), <Users size={15} />, { label: 'Follow, counter-march, conveyor…' }),
    ...groups.map(group => item(action('group.open', { id: group.id }), <Users size={15} />, { key: group.id, label: `Edit “${group.name}”` })),
    item(action('transition.open', undefined), <Waypoints size={15} />, { label: 'Formation transition…' }),
    item(action('routes.open', undefined), <Route size={15} />, { label: 'Shared routes' }),
    { type: 'heading', label: 'This move' },
    item(action('path.operations-open', undefined), <SlidersHorizontal size={15} />, { label: 'Resize, reverse or copy timing' }),
    item(action('set.split-open', undefined), <Scissors size={15} />, { label: 'Split transition…' }),
    item(action('choreography.open', undefined), <Sparkles size={15} />, { label: 'Choreography cues…' }),
  ];
  const paths = action('display.paths', undefined, 'From', 'Paths from previous set', c.showPaths), nextPaths = action('display.next-paths', undefined, 'To', 'Paths to next set', c.showNextPaths);
  const shapeMenu: MenuEntry[] = [...shapes.map(shape => item(shape.action, shape.icon, { key: shape.action.key })), ...moreShapes];
  const arrangeMenu: MenuEntry[] = [
    item(align, <AlignHorizontalJustifyCenter size={15} />, { label: 'Align and space' }), item(rotate, <RotateCw size={15} />, { label: 'Rotate and scale' }),
    item(mirror, <FlipHorizontal2 size={15} />, { label: 'Mirror across the 50' }), item(mirrorFrontBack, <FlipHorizontal2 size={15} style={{ transform: 'rotate(90deg)' }} />),
    item(place, <MapPin size={15} />, { label: 'Enter coordinates' }),
  ];

  return bar(count === 0 ? 'selection' : count === 1 ? 'performer' : 'group', <>
    <div className="toolbar-group toolbar-pointers" role="group" aria-label="Pointer">
      {tool(select, <MousePointer2 size={16} />, { description: 'Click a dot or drag a box. Shift adds to the selection.' })}
      {tool(lasso, <Lasso size={16} />, { description: 'Draw around performers to select an irregular group.' })}
      {tool(pan, <Hand size={16} />, { description: 'Drag to move around a zoomed field.' })}
      <Menu label="Select menu" description="Select all, a section, a saved group, or by rank and file." className="tool tool--menu" items={selectMenu}><ListFilter size={16} /><ChevronDown size={11} /></Menu>
    </div>
    <span className="divider-vertical" />
    <div className="toolbar-group toolbar-shapes" role="group" aria-label="Shape the selection">
      <span className="toolbar-caption">Shape</span>
      {shapes.map(shape => tool({ ...shape.action, active: !!session && !session.scatter && !session.bezier && session.kind === shape.kind }, shape.icon, { description: shapeHelp ?? `Arrange the ${count} selected performers in ${shape.kind === 'arc' ? 'an' : 'a'} ${shape.action.label.toLowerCase()}. Adjust on the field, then Apply.` }))}
      <Menu label="More shapes" description="Bézier curves, scatter and your saved formations." className="tool tool--menu" items={moreShapes}><MoreHorizontal size={16} /></Menu>
    </div>
    <span className="divider-vertical" />
    <div className="toolbar-group toolbar-arrange" role="group" aria-label="Arrange the selection">
      <span className="toolbar-caption">Arrange</span>
      {tool(align, <AlignHorizontalJustifyCenter size={16} />, { description: 'Align, distribute or set an exact interval between the selected performers.' })}
      {tool(rotate, <RotateCw size={16} />, { description: 'Rotate or scale the selection around a pivot.' })}
      <span className="tool-split">
        {tool(mirror, <FlipHorizontal2 size={16} />, { description: 'Flip the selection across the 50 yard line.' })}
        <Menu label="Mirror options" className="tool tool--caret" items={[item(mirror, <FlipHorizontal2 size={15} />, { label: 'Mirror across the 50' }), item(mirrorFrontBack, <FlipHorizontal2 size={15} style={{ transform: 'rotate(90deg)' }} />)]}><ChevronDown size={11} /></Menu>
      </span>
      {tool(place, <MapPin size={16} />, { description: 'Type drill coordinates such as “4 outside the 40, 8 behind the front hash”.' })}
    </div>
    <span className="toolbar-shape-menu">
      <Menu label="Shape" description="Arrange the selection in a line, arc, circle, block, wave, curve or scatter." className="tool tool--labelled" items={shapeMenu}><ArcIcon size={18} /><span className="tool-label">Shape</span><ChevronDown size={12} /></Menu>
    </span>
    <span className="toolbar-arrange-menu">
      <Menu label="Arrange" description="Align, rotate, mirror or place the selection." className="tool tool--labelled" items={arrangeMenu}><AlignHorizontalJustifyCenter size={16} /><span className="tool-label">Arrange</span><ChevronDown size={12} /></Menu>
    </span>
    <span className="divider-vertical" />
    <div className="toolbar-group">
      <Menu label="Motion" description="Travel paths, timing, group movement and transitions for the move into this set." className="tool tool--labelled" items={motionMenu}><Route size={16} /><span className="tool-label">Motion</span><ChevronDown size={12} /></Menu>
      {tool(staging, <Package size={16} />, { label: true, description: 'Place and pose props and front ensemble equipment on this set.', className: 'toolbar-optional' })}
    </div>
    {end(<div className="toolbar-group toolbar-paths" role="group" aria-label="Travel paths">
      {tool(paths, <PathsFromIcon size={17} />, { state: c.showPaths ? 'On' : 'Off', description: 'Show how performers travel into this set from the previous one.' })}
      {tool(nextPaths, <PathsToIcon size={17} />, { state: c.showNextPaths ? 'On' : 'Off', description: 'Show how performers travel from this set to the next one.' })}
    </div>)}
  </>);
}
