import { useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { AlignHorizontalJustifyCenter, ArrowRight, Bookmark, Check, ChevronDown, Clapperboard, Clock3, Eye, FlipHorizontal2, Focus, Grid3X3, Hand, Lasso, LayoutPanelLeft, ListFilter, Magnet, Blend, Footprints, Spline, SquareDashedMousePointer, MapPin, MoreHorizontal, MousePointer2, Package, PanelRight, Pencil, RotateCw, Route, Scissors, Shapes, SlidersHorizontal, Sparkles, Tags, TriangleAlert, Users, X } from 'lucide-react';
import { HelpButton } from '../editor/ControlHelp';
import { commandRegistry, type CommandArguments, type CommandId } from '../editor/commands';
import { fieldAction, type FieldAction } from '../editor/fieldToolbarModel';
import { Popout3DButton } from '../editor/Popout3D';
import type { EditorController } from '../editor/useEditorController';
import { fieldViews } from '../workspaces';
import { Menu, type MenuEntry } from '../ui/Menu';
import { ArcIcon, BezierIcon, BlockIcon, CircleIcon, LineIcon, PathsFromIcon, PathsToIcon, ScatterIcon, WaveIcon } from '../ui/icons';
import { timelineReadout } from '../editor/timelineNavigation';
import { useEditorSelector } from '../editor/react';
import type { ShellLayout } from './useShellLayout';

const PREVIEW_NAMES = { selection: 'Selection', transform: 'Transform', formation: 'Formation', spacing: 'Align and space', coordinates: 'Coordinates' } as const;
type PreviewKind = keyof typeof PREVIEW_NAMES;

/**
 * A toolbar is one Tab stop. Left/Right and Home/End move between its controls, unavailable ones included so their
 * reason can be read, and Tab comes back to the control used last. Controls a narrow strip folds away are skipped.
 */
function useRovingFocus() {
  const bar = useRef<HTMLDivElement>(null), last = useRef<HTMLElement | null>(null);
  const controls = () => [...(bar.current?.querySelectorAll<HTMLElement>('button') ?? [])].filter(control => control.getClientRects().length > 0);
  const sync = () => {
    const node = bar.current; if (!node) return;
    const shown = controls(), active = document.activeElement as HTMLElement | null;
    const stop = active && shown.includes(active) ? active : last.current && shown.includes(last.current) ? last.current : shown[0] ?? null;
    last.current = stop;
    for (const control of node.querySelectorAll<HTMLElement>('button')) { const tabIndex = control === stop ? '0' : '-1'; if (control.getAttribute('tabindex') !== tabIndex) control.setAttribute('tabindex', tabIndex); }
  };
  useLayoutEffect(() => {
    const node = bar.current; if (!node) return;
    // The strip folds groups into menus as it narrows, and its controls change with the context.
    const resized = new ResizeObserver(sync), changed = new MutationObserver(sync);
    sync(); resized.observe(node); changed.observe(node, { childList: true, subtree: true });
    return () => { resized.disconnect(); changed.disconnect(); };
  }, []);
  return {
    ref: bar,
    onFocus: (event: FocusEvent<HTMLDivElement>) => { if (bar.current?.contains(event.target)) sync(); },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
      const shown = controls(), at = shown.indexOf(event.target as HTMLElement);
      if (at < 0) return;
      event.preventDefault(); event.stopPropagation();
      shown[event.key === 'Home' ? 0 : event.key === 'End' ? shown.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + shown.length) % shown.length]?.focus();
    },
  };
}

/** The one tool strip above the field. Its tools stay where they are; they enable and disable with context. */
/** Where playback is, kept live: the transport counts, this names the move and offers the way back to editing. */
function PlaybackStatus({ controller: c }: { controller: EditorController }) {
  const rehearsal = useEditorSelector(state => !!state.playback.rehearsalId);
  // Re-render when the playhead crosses a set, not on every frame.
  const at = useEditorSelector(state => { const p = timelineReadout(c.project, state.playback.count); return `${p.setIndex}:${p.setIndex > 0 && !p.arrived ? 1 : 0}`; });
  const [setIndex, moving] = at.split(':').map(Number), name = c.project.sets[setIndex]?.name ?? '';
  return <>
    <div className="toolbar-preview" role="status" id="field-lock-message">
      <span className={`toolbar-preview-dot${c.playing ? ' is-playing' : ' is-locked'}`} />
      <strong>{c.playing ? 'Playing' : rehearsal ? 'Rehearsal passage' : 'Between sets'}</strong>
      <span>{moving ? `Move ${setIndex} → ${setIndex + 1}` : `Set ${setIndex + 1} · ${name}`}</span>
    </div>
    <div className="toolbar-commit">
      <HelpButton command="set.select" showShortcut={false} title={`Go to set ${setIndex + 1} to edit`} description="Stop at this set so its positions can be edited." className="button" onClick={() => c.selectSet(setIndex)}>Edit set {setIndex + 1}<ArrowRight size={14} /></HelpButton>
    </div>
  </>;
}

export function Toolbar({ controller: c, layout }: { controller: EditorController; layout: ShellLayout }) {
  const roving = useRovingFocus();
  // The camera is not part of the controller: follow it here so the pressed camera is the one in use.
  const camera = useEditorSelector(state => state.ui.camera);
  const state = c.store.getState();
  const action = <I extends CommandId>(id: I, args: CommandArguments[I], label?: string, title?: string, active?: boolean) => fieldAction(state, id, args, '', label, title, active);
  const run = (a: FieldAction) => { c.dispatch(a.invocation.id, a.invocation.args as never); };
  const item = (a: FieldAction, icon: ReactNode, extra: Partial<Extract<MenuEntry, { label: string }>> = {}): MenuEntry => ({
    label: a.label, icon, command: a.invocation.id, disabled: !!a.disabledReason, disabledReason: a.disabledReason ?? undefined, onSelect: () => run(a), ...extra,
  });
  const tool =(a: FieldAction, icon: ReactNode, options: { label?: boolean; description?: string; state?: string; className?: string } = {}) =>
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

  const panelName = layout.tab === 'cast' ? 'Cast' : 'Inspector';
  const panelToggle = <HelpButton pointerPassThrough title={layout.panelVisible ? `Collapse ${panelName}` : `Show ${panelName}`} description="Show or hide the Inspector and Cast panel beside the field." className="tool tool--quiet" aria-expanded={layout.panelVisible} aria-controls={`workspace-pane-${layout.tab}`} data-panel-toggle=""
    disabled={layout.locked && layout.docked || layout.preview && layout.panelVisible} disabledReason="Finish or cancel the current input or preview first." onClick={event => layout.togglePanel(event.detail > 0)}><PanelRight size={17} /></HelpButton>;
  const end = (extra?: ReactNode) => <div className="toolbar-end">{extra}{panelToggle}</div>;
  const bar = (context: string, children: ReactNode) => <div {...roving} className="canvas-toolbar field-command-toolbar toolbar" role="toolbar" aria-label="Field tools" aria-orientation="horizontal" data-context={context}>{children}</div>;

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

  // A docked editor owns the field: name it and point to its panel, rather than reading as "between sets".
  if (layout.dockedEditor) {
    return bar('editor', <>
      <div className="toolbar-preview" role="status">
        <span className="toolbar-preview-dot" />
        <strong>{c.pathOperations ? 'Move operations' : c.routeEditor ? 'Shared routes' : 'Performer movement'}</strong>
        <span>Adjust on the field · Apply or Cancel in the side panel</span>
      </div>
      {end()}
    </>);
  }

  // Playing or between sets: say so here, and offer the way back to editing. The field stays clear.
  if (c.readOnly && !three && !rehearse) {
    return bar(c.playing ? 'playback' : 'scrub', <>
      <PlaybackStatus controller={c} />
      {end()}
    </>);
  }

  // Rehearsing and the 3D view: cameras and review, no editing tools.
  if (three || rehearse) {
    const cameras = ([['perspective', 'Perspective'], ['front', 'Front'], ['press-box', 'Press box'], ['top', 'Overhead']] as const)
      .map(([preset, label]) => action('view.camera', { preset }, label, `${label} camera`, camera.preset === preset && !camera.savedId));
    const passages = action('rehearsal.open', undefined, 'Passages', 'Rehearsal passages');
    const problems = action('analysis.problems-open', undefined, 'Problems', 'Show-wide problems');
    const video = action('dialog.open', { dialog: 'video-export' }, 'Record video', 'Rehearsal video');
    return bar(three ? '3d' : 'rehearsal', <>
      {three && <><div className="toolbar-group stage-three__controls" role="group" aria-label="Camera">
        <span className="toolbar-caption">Camera</span>
        <div className="segmented">{cameras.map(a => <HelpButton key={a.key} command="view.camera" showShortcut={false} title={a.title} aria-pressed={!!a.active} disabled={!!a.disabledReason} disabledReason={a.disabledReason ?? undefined} data-command="view.camera" onClick={() => run(a)}>{a.label}</HelpButton>)}</div>
      </div><span className="divider-vertical" /></>}
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
  const saved = action('templates.open', undefined, 'Browse saved formations');
  const align = action('spacing.preview', undefined, 'Align', 'Align selection');
  const rotate = action('transform.preview', {}, 'Rotate', 'Rotate selection');
  const mirror = action('transform.preview', { operation: 'across-50' }, 'Mirror', 'Mirror selection');
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
    item(action('selection.tools', undefined), <SlidersHorizontal size={15} />, { label: 'Selection tools and groups', description: 'Select a rank or file, type a lasso, and save named groups.' }),
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
  const onePerformer: MenuEntry[] = [
    // One reason for the whole group, in its heading; what each item does is in its tooltip, so the menu reads as a list of names.
    { type: 'heading', label: count === 1 ? 'One performer' : 'One performer · select exactly one' },
    item(action('path.open', undefined), <Spline size={15} />, { label: 'Edit performer path', description: 'Curve one performer’s travel into this set with handles on the field.' }),
    item(action('path.draw-open', undefined), <Pencil size={15} />, { label: 'Draw performer path', description: 'Sketch one performer’s travel into this set on the field.' }),
    item(action('schedule.open', undefined), <Clock3 size={15} />, { label: 'Edit movement timing', description: 'Give one performer holds and timed stages within the move.' }),
  ];
  const groupMotion: MenuEntry[] = [
    { type: 'heading', label: 'Groups' },
    item(action('group.open', {}), <Footprints size={15} />, { label: 'Group route movement', description: 'Follow the leader, counter-march or conveyor along a shared route.' }),
    ...groups.map(group => item(action('group.open', { id: group.id }), <Users size={15} />, { key: group.id, name: `Edit group ${group.name}`, label: `“${group.name}”` })),
    item(action('transition.open', undefined), <Blend size={15} />, { label: 'Formation transition', description: 'Morph one live formation into another with shared timing and checks.' }),
    item(action('routes.open', undefined), <Route size={15} />, { label: 'Shared routes', description: 'Draw reusable routes that group movements travel along.' }),
    { type: 'heading', label: 'This move' },
    item(action('path.operations-open', undefined), <SlidersHorizontal size={15} />, { label: 'Move operations', description: 'Resize the move’s counts, reverse it, or copy its intervals.' }),
    item(action('set.split-open', undefined), <Scissors size={15} />, { label: 'Split transition' }),
    item(action('choreography.open', undefined), <Sparkles size={15} />, { label: 'Choreography cues' }),
  ];
  // With a group selected, what applies to it comes first; the one-performer tools wait at the bottom, still named, with their reason.
  const motionMenu: MenuEntry[] = count >= 2 ? [...groupMotion, ...onePerformer] : [...onePerformer, ...groupMotion];
  const shapeMenu: MenuEntry[] = [...shapes.map(shape => item(shape.action, shape.icon, { key: shape.action.key })), ...moreShapes];
  const arrangeMenu: MenuEntry[] = [
    item(align, <AlignHorizontalJustifyCenter size={15} />, { label: 'Align selection' }), item(rotate, <RotateCw size={15} />, { label: 'Rotate selection' }),
    item(mirror, <FlipHorizontal2 size={15} />, { label: 'Mirror across the 50' }), item(mirrorFrontBack, <FlipHorizontal2 size={15} style={{ transform: 'rotate(90deg)' }} />),
    item(place, <MapPin size={15} />, { label: 'Enter coordinates' }),
  ];

  return bar(count === 0 ? 'selection' : count === 1 ? 'performer' : 'group', <>
    <div className="toolbar-group toolbar-pointers" role="group" aria-label="Pointer">
      {tool(select, <MousePointer2 size={16} />, { description: 'Click a dot or drag a box. Shift adds to the selection.' })}
      {tool(lasso, <Lasso size={16} />, { description: 'Draw around performers to select an irregular group.' })}
      {tool(pan, <Hand size={16} />, { description: 'Drag to move around a zoomed field.' })}
      <Menu label="Select menu" description="Select all, a section, a saved group, or by rank and file." className="tool tool--menu" items={selectMenu}><SquareDashedMousePointer size={16} /><ChevronDown size={11} /></Menu>
    </div>
    <span className="divider-vertical" />
    <div className="toolbar-group toolbar-shapes" role="group" aria-label="Shape the selection">
      {shapes.map(shape => tool({ ...shape.action, active: !!session && !session.scatter && !session.bezier && session.kind === shape.kind }, shape.icon, { label: true, description: shapeHelp ?? `Arrange the ${count} selected performer${count === 1 ? '' : 's'} in ${shape.kind === 'arc' ? 'an' : 'a'} ${shape.action.label.toLowerCase()}. Adjust on the field, then Apply.` }))}
      <Menu label="More shapes" description="Bézier curves, scatter and your saved formations." className="tool tool--menu" items={moreShapes}><MoreHorizontal size={16} /></Menu>
    </div>
    <span className="toolbar-shape-menu">
      <Menu label="Shape" description="Arrange the selection in a line, arc, circle, block, wave, curve or scatter." className="tool tool--labelled" items={shapeMenu}><ArcIcon size={18} /><span className="tool-label">Shape</span><ChevronDown size={12} /></Menu>
    </span>
    <span className="divider-vertical" />
    <div className="toolbar-group toolbar-arrange" role="group" aria-label="Arrange the selection">
      {tool(align, <AlignHorizontalJustifyCenter size={16} />, { label: true, description: 'Align, distribute or set an exact interval between the selected performers.' })}
      {tool(rotate, <RotateCw size={16} />, { label: true, description: 'Rotate or scale the selection around a pivot.' })}
      <span className="tool-split">
        {tool(mirror, <FlipHorizontal2 size={16} />, { label: true, description: 'Flip the selection across the 50 yard line.' })}
        <Menu label="Mirror options" className="tool tool--caret" items={[item(mirror, <FlipHorizontal2 size={15} />, { label: 'Mirror across the 50' }), item(mirrorFrontBack, <FlipHorizontal2 size={15} style={{ transform: 'rotate(90deg)' }} />)]}><ChevronDown size={11} /></Menu>
      </span>
      {tool(place, <MapPin size={16} />, { label: true, description: 'Type drill coordinates such as “4 outside the 40, 8 behind the front hash”.' })}
    </div>
    <span className="toolbar-arrange-menu">
      <Menu label="Arrange" description="Align, rotate, mirror or place the selection." className="tool tool--labelled" items={arrangeMenu}><AlignHorizontalJustifyCenter size={16} /><span className="tool-label">Arrange</span><ChevronDown size={12} /></Menu>
    </span>
    <span className="divider-vertical" />
    <div className="toolbar-group">
      <Menu label="Motion" description="Travel paths, timing, group movement and transitions for the move into this set." className="tool tool--labelled" items={motionMenu}><Route size={16} /><span className="tool-label">Motion</span><ChevronDown size={12} /></Menu>
      {tool(staging, <Package size={16} />, { label: true, description: 'Place and pose props and front ensemble equipment on this set.', className: 'toolbar-optional' })}
    </div>
    {end()}
  </>);
}

/** View controls that float over the field's margin: travel paths, display options and 2D / 3D / Split. */
export function ViewControls({ controller: c, layout, onWorkspaces }: { controller: EditorController; layout: ShellLayout; onWorkspaces: () => void }) {
  const roving = useRovingFocus();
  const state = c.store.getState();
  const action = <I extends CommandId>(id: I, args: CommandArguments[I], label?: string, title?: string, active?: boolean) => fieldAction(state, id, args, '', label, title, active);
  const run = (a: FieldAction) => { c.dispatch(a.invocation.id, a.invocation.args as never); };
  const item = (a: FieldAction, icon: ReactNode, extra: Partial<Extract<MenuEntry, { label: string }>> = {}): MenuEntry => ({
    label: a.label, icon, command: a.invocation.id, disabled: !!a.disabledReason, disabledReason: a.disabledReason ?? undefined, onSelect: () => run(a), ...extra,
  });
  const three = c.view === '3d';
  const labelsState = !c.showLabels ? 'hidden' : c.selectionLabelsOnly ? 'selected' : 'all';
  const setLabels = (next: 'all' | 'selected' | 'hidden') => { c.setShowLabels(next !== 'hidden'); c.setSelectionLabelsOnly(next === 'selected'); };
  const paths = action('display.paths', undefined), nextPaths = action('display.next-paths', undefined);
  const pathsMenu: MenuEntry[] = [
    item(paths, <PathsFromIcon size={16} />, { label: 'Show paths from previous set', checked: c.showPaths, keepOpen: true, description: 'Show how performers travel into this set.' }),
    item(nextPaths, <PathsToIcon size={16} />, { label: 'Show paths to next set', checked: c.showNextPaths, keepOpen: true, description: 'Show how performers travel out of this set.' }),
  ];
  const viewMenu: MenuEntry[] = [
    { type: 'heading', label: 'Performer labels' },
    { label: 'Show labels', icon: <Tags size={15} />, hint: 'where they fit', checked: labelsState === 'all', radio: true, keepOpen: true, description: 'Label every performer. Labels that would overlap are left out; zoom in to see them all.', onSelect: () => setLabels('all') },
    { label: 'Selected only', icon: <Tags size={15} />, checked: labelsState === 'selected', radio: true, keepOpen: true, onSelect: () => setLabels('selected') },
    { label: 'Hide labels', icon: <Tags size={15} />, checked: labelsState === 'hidden', radio: true, keepOpen: true, onSelect: () => setLabels('hidden') },
    { type: 'heading', label: 'Grid' },
    item(action('display.grid', undefined), <Grid3X3 size={15} />, { label: 'Show field grid', checked: c.showGrid, keepOpen: true }),
    item(action('display.snap', undefined), <Magnet size={15} />, { label: 'Snap to grid', checked: c.snap, keepOpen: true }),
    item(action('dialog.open', { dialog: 'snapping' }), <SlidersHorizontal size={15} />, { name: 'Grid and snapping', label: 'Grid and snapping…', command: undefined, description: 'Choose the step grid and what direct edits snap to.' }),
    { type: 'heading', label: 'Window' },
    item(action('layout.focus', undefined), <Focus size={15} />, { label: layout.focusMode ? 'Exit focus' : 'Focus field', checked: layout.focusMode }),
    { label: 'Workspaces…', icon: <LayoutPanelLeft size={15} />, description: 'Switch, save, rename or reset arrangements of the window on this device.', onSelect: onWorkspaces },
  ];
  return <div {...roving} className="canvas-view" role="toolbar" aria-label="View" aria-orientation="horizontal">
    {!three && <Menu label="Travel paths" description="Show how performers travel into or out of this set." className={`canvas-chip${c.showPaths || c.showNextPaths ? ' active' : ''}`} align="end" items={pathsMenu}><PathsFromIcon size={15} /><span>Paths</span><ChevronDown size={11} /></Menu>}
    {!three && <Menu label="View options" description="Labels, grid, snapping and focus." className="canvas-chip" align="end" items={viewMenu}><Eye size={14} /><span>View</span><ChevronDown size={11} /></Menu>}
    <div className="canvas-segmented view-switch" role="group" aria-label="Field view">
      {fieldViews.map(view => {
        const a = action('view.select', { view }, view === '2d' ? '2D' : view === '3d' ? '3D' : 'Split', view === '2d' ? '2D field' : view === '3d' ? '3D preview' : 'Split review', c.view === view);
        return <HelpButton key={view} command="view.select" showShortcut={view !== 'split'} title={a.title} description={view === '2d' ? 'Edit on the flat field.' : view === '3d' ? 'Watch from the stands in 3D.' : 'Edit in 2D beside a live 3D preview.'}
          aria-pressed={c.view === view} disabled={!!a.disabledReason} disabledReason={a.disabledReason ?? undefined} data-toolbar-item={`view-${view}`} onClick={() => run(a)}>{a.label}</HelpButton>;
      })}
    </div>
    <Popout3DButton controller={c} toolbarItem="popout" />
  </div>;
}
