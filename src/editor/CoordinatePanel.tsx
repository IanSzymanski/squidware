import { useEffect, useId, useRef } from 'react';
import { DRILL_ENTRY_LIMIT, formatDrillCoordinate, type CoordinateEntryOptions } from '../drillEntry';
import { DEFAULT_SNAPPING } from '../snapping';
import { Tooltip } from '../components/Tooltip';
import { HelpButton } from './ControlHelp';
import type { EditorController } from './useEditorController';

export function CoordinatePanel({controller:c}:{controller:EditorController}) {
  const section=useRef<HTMLElement>(null);const input=useRef<HTMLTextAreaElement>(null);const help=useId();
  useEffect(()=>{section.current?.scrollIntoView({block:'nearest'});input.current?.focus();},[]);
  const session=c.coordinatePreview;if(!session)return null;
  const options=session.options;const result=c.coordinateResult!;
  const steps=(c.project.snapping??DEFAULT_SNAPPING).steps;
  const update=(patch:Partial<CoordinateEntryOptions>)=>c.dispatch('coordinates.update',{options:{...options,...patch}});
  const choice=(name:string,text:string,active:boolean,action:()=>void,disabled=false,reason='Finish or cancel the pending input first.')=><HelpButton title={name} description={name} aria-pressed={active} className={active?'button primary':'button subtle'} disabled={disabled||c.pendingDraft} disabledReason={reason} onClick={action}>{text}</HelpButton>;
  const number=(n:number)=>Number(n.toFixed(6));
  const example=options.mode==='absolute'?'Side 1: 4 outside the 40; 6 behind front hash':'3 steps forward, 2 steps left';
  return <section ref={section} className="inspector-section transform-panel coordinate-panel" aria-label="Drill-language coordinate entry">
    <h3>Enter coordinates</h3>
    <p className="section-description">{session.ids.length} selected · set {c.index+1}. Preview first, then Apply.</p>
    <div className="form-row" role="group" aria-label="Coordinate entry mode">
      {choice('Absolute performer placement','Place one',options.mode==='absolute',()=>update({mode:'absolute'}),session.ids.length!==1,'Select one performer for absolute placement. Use a relative move for a group.')}
      {choice('Relative selection move','Move group',options.mode==='relative',()=>update({mode:'relative'}))}
    </div>
    <label className="form-label">Drill phrase<Tooltip name="Drill phrase" pointerPassThrough description="Type a complete coordinate or movement phrase. Preview updates while typing. Enter focuses Apply; Escape cancels this preview."><textarea ref={input} aria-label="Drill phrase" spellCheck={false} autoComplete="off" rows={3} maxLength={DRILL_ENTRY_LIMIT} value={options.text} placeholder={example} aria-invalid={!!options.text.trim()&&!!result.error} aria-describedby={help}
      onChange={event=>update({text:event.target.value})} onKeyDown={event=>{
        if(event.nativeEvent.isComposing)return;
        if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.stopPropagation();if(!result.error&&result.changed)document.querySelector<HTMLElement>('[aria-label="Apply coordinates"]')?.focus();}
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();c.dispatch('coordinates.cancel');requestAnimationFrame(()=>document.querySelector<HTMLElement>('[aria-label="Enter coordinates"]')?.focus());}
      }}/></Tooltip></label>
    <div className="form-row coordinate-examples">
      <HelpButton title="Use example phrase" description="Insert the displayed example for the current entry mode without committing it." className="button subtle" onClick={()=>update({text:example,side:null,defaultUnit:'steps'})}>Use example</HelpButton>
      {options.mode==='absolute'&&session.ids.length===1&&<HelpButton title="Use current coordinate" description="Format this performer's committed position at the selected output precision and production step size. The resulting preview can round its position." className="button subtle" onClick={()=>update({text:formatDrillCoordinate(c.activeSet.positions[session.ids[0]],c.project.field,steps,c.coordinateFormat),side:null})}>Use current</HelpButton>}
    </div>
    {options.mode==='absolute'&&<>
      <p className="form-label">Side for an unlabelled phrase</p>
      <div className="spacing-choices" role="group" aria-label="Coordinate side">
        {choice('Take side from phrase','From phrase',options.side===null,()=>update({side:null}))}
        {choice('Use Side 1 for coordinate entry','Side 1',options.side===1,()=>update({side:1}))}
        {choice('Use Side 2 for coordinate entry','Side 2',options.side===2,()=>update({side:2}))}
      </div>
      <p className="microcopy">Side 1 is the physical left half; Side 2 is the right half. Inside goes toward midfield. Name front/back hash or sideline explicitly.</p>
    </>}
    <p className="form-label">Interpret bare numbers as</p>
    <div className="spacing-choices" role="group" aria-label="Coordinate bare-number units">
      {choice('Bare numbers mean production steps','Steps',options.defaultUnit==='steps',()=>update({defaultUnit:'steps'}))}
      {choice('Bare numbers mean yards','Yards',options.defaultUnit==='yards',()=>update({defaultUnit:'yards'}))}
      {choice('Require units in the phrase','Require units',options.defaultUnit===null,()=>update({defaultUnit:null}))}
    </div>
    <p className="microcopy">Entry uses {steps}-to-5 steps: 1 step = {number(5/steps)} yd. Explicit steps/yards in the phrase take precedence. Rehearsal coordinate readouts use 8-to-5.</p>
    <p className={`transform-result${result.error&&options.text.trim()?' transform-result--error':''}`} id={help} role="status">{result.error || (c.pendingDraft?'Finish or cancel the pending input before Apply.':result.changed?'Preview ready. Apply records one undo action.':'The preview matches the original positions.')}</p>
    {result.parsed?.mode==='absolute'&&<div className="coordinate-resolved"><p>Target: X {number(result.parsed.point.x)} · Y {number(result.parsed.point.y)} yd</p><p>{formatDrillCoordinate(result.parsed.point,c.project.field,steps,c.coordinateFormat)}</p></div>}
    {result.parsed?.mode==='relative'&&<p className="coordinate-resolved">Group delta: X {number(result.parsed.delta.x)} · Y {number(result.parsed.delta.y)} yd</p>}
    <p className="microcopy">Forward is toward the front sideline; right is toward Side 2, regardless of audience orientation or facing. Exact entry bypasses snapping. Field crossings reject the whole move.</p>
    <p className="microcopy">Enter focuses Apply; Enter on the field applies. Escape cancels. Changing selection, set or editing context cancels this preview.</p>
  </section>;
}
