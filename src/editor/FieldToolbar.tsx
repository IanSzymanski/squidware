import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AlignHorizontalJustifyCenter, ArrowDownLeft, ArrowUpRight, Box, Camera, Check, Clock3, FlipHorizontal2, Grid2X2, Hand, Lasso, LayoutGrid, Magnet, MapPin, Maximize, Minus, MoreHorizontal, MousePointer2, Move, Pause, Pencil, Plus, RotateCw, Route, Shapes, SlidersHorizontal, Sparkles, SquareDashed, Tags, Users, Waypoints, X } from 'lucide-react';
import { HelpButton, CommandKeycaps } from './ControlHelp';
import { fieldAction, fieldToolbar, type FieldAction } from './fieldToolbarModel';
import type { EditorController } from './useEditorController';
import { useEditorSelector } from './react';
import { Popout3DButton } from './Popout3D';
import './fieldToolbar.css';

const icons = {move:Move,select:MousePointer2,lasso:Lasso,selection:SquareDashed,pan:Hand,all:Users,cancel:X,rotate:RotateCw,shape:Sparkles,align:AlignHorizontalJustifyCenter,place:MapPin,mirror:FlipHorizontal2,path:Waypoints,draw:Pencil,timing:Clock3,route:Route,operations:SlidersHorizontal,saved:Shapes,group:Users,transition:Waypoints,previous:ArrowDownLeft,next:ArrowUpRight,snap:Magnet,settings:SlidersHorizontal,grid:LayoutGrid,labels:Tags,minus:Minus,plus:Plus,fit:Maximize,apply:Check,pause:Pause,camera:Camera};
function Icon({name}:{name:string}) { const Glyph=icons[name as keyof typeof icons]??MousePointer2;return <Glyph size={15} aria-hidden="true"/>; }
const toolbarItems = (root:HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('[data-toolbar-item]')].filter(n=>n.getClientRects().length);

export function FieldToolbar({controller:c}:{controller:EditorController}) {
  // The controller already subscribes to editing context and arrival/read-only
  // changes. Do not subscribe this chrome to per-frame playback positions.
  useEditorSelector(s=>s.ui.camera);
  const state=c.store.getState(), model=fieldToolbar(state);
  const row=useRef<HTMLDivElement>(null), actions=useRef<HTMLDivElement>(null), measure=useRef<HTMLDivElement>(null), more=useRef<HTMLButtonElement|null>(null);
  const [count,setCount]=useState(0),[open,setOpen]=useState(false),[focused,setFocused]=useState('view-2d');
  const focusWasInside=useRef(false),previousKey=useRef(''),activeControl=useRef<HTMLElement|null>(null);
  const focusedKey=useRef(focused);focusedKey.current=focused;
  const signature=model.context+model.primary.map(a=>a.key+a.label).join('|');
  useLayoutEffect(()=>{
    function size() {
      if(!actions.current||!measure.current)return;
      // Rects include the personal CSS UI scale; clientWidth does not. Compare
      // widths in the same coordinate space before choosing overflow items.
      const scale=actions.current.getBoundingClientRect().width/actions.current.clientWidth||1;
      let width=0,visible=0;
      for(const n of measure.current.children){width+=(visible?4:0)+n.getBoundingClientRect().width/scale;if(width>actions.current.clientWidth)break;visible++;}
      setCount(n=>n===visible?n:visible);
      if(row.current){const items=toolbarItems(row.current);if(!items.some(n=>n.dataset.toolbarItem===focusedKey.current)){
        const fallback=items.find(n=>n.dataset.toolbarItem==='more')??items[0];
        if(fallback){setFocused(fallback.dataset.toolbarItem!);if(focusWasInside.current&&document.activeElement===document.body)fallback.focus();}
      }}
    }
    size();const observer=new ResizeObserver(size);if(actions.current)observer.observe(actions.current);if(measure.current)observer.observe(measure.current);
    return()=>observer.disconnect();
  },[signature]);
  useLayoutEffect(()=>{
    const host=row.current;if(!host)return;more.current=host.querySelector('[data-toolbar-item="more"]');
    const items=toolbarItems(host),current=items.find(n=>n.dataset.toolbarItem===focused);
    if(!current){const fallback=more.current??items[0];if(fallback){setFocused(fallback.dataset.toolbarItem!);if(focusWasInside.current&&(!document.activeElement||document.activeElement===document.body))fallback.focus();}}
    if(previousKey.current!==signature&&!c.dialog){
      // A context change can move the focused action between the row and its
      // menu. Return to the stable trigger before hiding that menu.
      if(host.querySelector('.field-tools-menu')?.contains(document.activeElement)||focusWasInside.current&&document.activeElement===document.body&&activeControl.current?.isConnected===false)more.current?.focus({preventScroll:true});
      setOpen(false);
    }
    previousKey.current=signature;
  },[signature,count,focused,c.dialog]);
  useEffect(()=>{
    if(!open||c.dialog)return;
    const close=(event:PointerEvent)=>{if(!row.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);
  },[open,c.dialog]);
  const primary=model.primary.slice(0,count),overflow=[...model.primary.slice(count),...model.secondary];
  function run(action:FieldAction) {
    const {id,args}=action.invocation;
    // A command closes its menu. A dialog restores focus to the stable More
    // button, rather than an action that becomes hidden after activation.
    if(document.activeElement?.closest('.field-tools-menu'))more.current?.focus({preventScroll:true});
    c.dispatch(id,args as never);
    if(id==='selection.move-controls')requestAnimationFrame(()=>document.querySelector<HTMLElement>('.move-selection-left')?.focus());
    setOpen(false);
  }
  function keyDown(event:KeyboardEvent<HTMLDivElement>) {
    if(event.nativeEvent.isComposing)return;
    if(event.key==='Escape'&&open&&!c.dialog){event.preventDefault();event.stopPropagation();setOpen(false);more.current?.focus();return;}
    // Let the focused button activate normally, without also invoking editor
    // shortcuts such as Enter-to-Apply or Space-to-Play behind it.
    if(event.key==='Enter'||event.key===' '){event.stopPropagation();return;}
    if(event.target instanceof HTMLElement&&event.target.closest('.field-tools-menu'))return;
    if(event.key==='ArrowDown'&&event.target===more.current){event.preventDefault();setOpen(true);requestAnimationFrame(()=>row.current?.querySelector<HTMLElement>('.field-tools-menu button')?.focus());return;}
    if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
    const items=toolbarItems(event.currentTarget),index=items.indexOf(document.activeElement as HTMLButtonElement);
    if(index<0)return;
    event.preventDefault();event.stopPropagation();
    items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowRight'?1:-1)+items.length)%items.length]?.focus();
  }
  function render(action:FieldAction,menu=false) {
    const helpCommand=action.invocation.id==='transform.preview'&&action.invocation.args.operation==='across-50'?'transform.mirror':action.invocation.id;
    const stateText=action.invocation.id==='display.labels'? !c.showLabels?'Hidden':c.selectionLabelsOnly?'Selected / focused':'All':action.invocation.id.startsWith('field.')?`${Math.round(c.zoom*100)}%`:action.active===undefined?undefined:action.active?'On':'Off';
    const description=action.invocation.id==='formation.preview'?`Preview a shape for ${c.selectedIds.length} selected performers before applying.`:helpCommand==='transform.mirror'?'Preview a mirror across the 50. Apply or Cancel before editing other positions.':undefined;
    return <HelpButton key={action.key} pointerPassThrough={menu} command={helpCommand} title={action.title} description={description} disabled={!!action.disabledReason} disabledReason={action.disabledReason??undefined}
      active={menu?undefined:action.active} state={stateText}
      role={menu?action.active===undefined?'menuitem':'menuitemcheckbox':undefined} aria-checked={menu?action.active:undefined}
      data-toolbar-item={menu?undefined:action.key} data-command={action.invocation.id} tabIndex={menu?-1:focused===action.key?0:-1}
      className={`field-action${action.active?' active':''}${action.invocation.id==='formation.preview'?' preview-formation':''}${action.invocation.id.endsWith('.apply')?' field-action--apply':''}`}
      onClick={()=>run(action)}><Icon name={action.icon}/><span>{action.label}</span>{menu&&<CommandKeycaps command={helpCommand}/>}</HelpButton>;
  }
  return <div className="canvas-toolbar field-command-toolbar" ref={row} role="toolbar" aria-label="Field tools" aria-orientation="horizontal" data-context={model.context} data-escape-scope={open||undefined}
    onKeyDown={keyDown} onFocus={event=>{focusWasInside.current=true;activeControl.current=event.target as HTMLElement;const key=(event.target as HTMLElement).dataset.toolbarItem;if(key)setFocused(key);}}
    onBlur={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node)){focusWasInside.current=false;if(!c.dialog)setOpen(false);}}}>
    <h1 className="canvas-set-title" title={c.visibleSet.name}><span className="canvas-set-number">SET {String(c.index+1).padStart(2,'0')}</span><span>{c.visibleSet.name}</span><span className="selection-count">{c.selectedIds.length} selected</span></h1>
    <div className="view-switch">{(['2d','3d'] as const).map(view=>{
      const a=fieldAction(state,'view.select',{view},'select',view==='2d'?'2D field':'3D preview');
      return <HelpButton key={view} command="view.select" title={a.title} active={c.view===view} disabled={!!a.disabledReason} disabledReason={a.disabledReason??undefined}
        data-toolbar-item={`view-${view}`} tabIndex={focused===`view-${view}`?0:-1} onClick={()=>run(a)}>{view==='2d'?<Grid2X2 size={15}/>:<Box size={15}/>}<span>{view==='2d'?'2D':'3D'}</span></HelpButton>;
    })}</div>
    <Popout3DButton controller={c} tabIndex={focused==='popout'?0:-1} toolbarItem="popout"/>
    <div className={`field-primary${model.context==='3d'?' stage-three__controls':''}`} ref={actions}>{primary.map(a=>render(a))}</div>
    {!!overflow.length&&<div className="field-tools-overflow">
      <HelpButton title="More field tools" description="Additional editing, display and zoom controls for the current context." className="field-action" data-toolbar-item="more" tabIndex={focused==='more'?0:-1} aria-haspopup="menu" aria-expanded={open}
        onClick={event=>{more.current=event.currentTarget;setOpen(!open);}}><MoreHorizontal size={16}/><span>More</span></HelpButton>
      <div hidden={!open} inert={!open} className="field-tools-menu" role="menu" aria-label="More field tools" onKeyDown={event=>{
        if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
          event.preventDefault();event.stopPropagation();const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')],index=items.indexOf(document.activeElement as HTMLButtonElement);
          items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
        }
      }}>{overflow.map(a=>render(a,true))}</div>
    </div>}
    <div ref={measure} className="field-toolbar-measure" aria-hidden="true" inert>{model.primary.map(a=><span className="field-action" key={a.key}><Icon name={a.icon}/><span>{a.label}</span></span>)}</div>
  </div>;
}
