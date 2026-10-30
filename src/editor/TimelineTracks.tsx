import { compileScore, scoreLabel, scorePosition, scoreTicks } from '../score';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Flag, LocateFixed, Maximize2, SlidersHorizontal, ZoomIn, ZoomOut } from 'lucide-react';
import { countToSeconds, secondsToCount, setStartCount, setTiming } from '../domain';
import { Tooltip } from '../components/Tooltip';
import { HelpButton } from './ControlHelp';
import { Button } from './EditorControls';
import { useEditorSelector } from './react';
import type { EditorController } from './useEditorController';
import { formatTimelineCount as fmt, timelineLabels, timelineWindow } from './timelineNavigation';
import './timeline.css';
import { ProblemTimeline, ProblemTimelineLabel } from './ProblemTimeline';

export function TimelineTracks({ controller }: { controller: EditorController }) {
  const { project, duration, index, playing, selectSet, scrub, audioName, waveform, audioLoading } = controller;
  const count = useEditorSelector(s => s.playback.count);
  const clockStatus = useEditorSelector(s => s.playback.clockStatus);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600), [zoom, setZoom] = useState(1), [start, setStart] = useState(0), [follow, setFollow] = useState(true);
  const [viewOpen, setViewOpen] = useState(false);
  const view = timelineWindow(duration, width, zoom, start);
  const { span } = view;
  useLayoutEffect(() => {
    const element = viewportRef.current!;
    const observer = new ResizeObserver(() => setWidth(Math.max(1, element.clientWidth - 28)));
    observer.observe(element); setWidth(Math.max(1, element.clientWidth - 28));
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setZoom(1); setStart(0); setFollow(true); }, [project.id]);
  useEffect(() => {
    if (follow && (count < view.start || count > view.start + span * (playing ? .9 : 1))) {
      setStart(timelineWindow(duration, width, zoom, count - span * .15).start);
    }
  }, [count, duration, width, zoom, follow, playing, span, view.start]);
  const arrivals = useMemo(() => project.sets.map((set, i) => ({ set, index: i, count: setStartCount(project, i), from: setStartCount(project, Math.max(0, i - 1)), counts: setTiming(project, i).counts })), [project]);
  const score = useMemo(()=>compileScore(project),[project]);
  const [musicalRuler,setMusicalRuler] = useState(true);
  const labels = musicalRuler ? scoreTicks(score,view.start,Math.min(duration,view.start+span),width) : timelineLabels(project,view.start,span,width).map(count=>({count,label:fmt(count)}));
  const markGroups = new Map<number,typeof score.marks>();
  for(const mark of score.marks.filter(m=>m.count>=view.start&&m.count<=view.start+span)){const bucket=Math.floor((mark.count-view.start)/span*width/75);markGroups.set(bucket,[...(markGroups.get(bucket)??[]),mark]);}
  const marks=[...markGroups.values()];
  const percent = (value: number) => (value - view.start) / span * 100;
  const changeZoom = (next: number) => {
    const anchor = count >= view.start && count <= view.start + span ? count : view.start + span / 2;
    const fraction = (anchor - view.start) / span;
    const nextView = timelineWindow(duration, width, next, 0);
    setZoom(nextView.zoom); setStart(timelineWindow(duration, width, nextView.zoom, anchor - fraction * nextView.span).start);
  };
  return <>
    {viewOpen && <div className="timeline-navigation" role="group" aria-label="Timeline view controls">
      <Button title="Zoom timeline out" description="Show more counts, keeping the playhead in view." disabled={view.zoom <= 1} disabledReason="The whole show is visible." onClick={() => changeZoom(view.zoom / 2)}><ZoomOut size={14} /></Button>
      <Button title="Zoom timeline in" description="Spread counts and set arrivals for precise navigation." disabled={view.zoom >= view.maxZoom} disabledReason="Timeline is at maximum zoom." onClick={() => changeZoom(view.zoom * 2)}><ZoomIn size={14} /></Button>
      <Button title="Fit show timeline" description="Show the opening set and every arrival." onClick={() => { setZoom(1); setStart(0); }}><Maximize2 size={14} /></Button>
      <Button title="Follow playhead" description="Keep the playhead visible during playback, stepping and set navigation. Panning turns follow off." active={follow} onClick={() => setFollow(!follow)}><LocateFixed size={14} /></Button>
      <Tooltip name="Go to timeline set" description="Choose any set by number, name and show arrival count. Stop playback and bring its arrival into view."><select aria-label="Go to timeline set" value={index} onChange={e => { const i = Number(e.target.value); selectSet(i); setStart(timelineWindow(duration, width, view.zoom, arrivals[i].count - span * .15).start); }}>
        {arrivals.map(a => <option key={a.set.id} value={a.index}>Set{String(a.index + 1).padStart(3, '0')} · {a.set.name} · {fmt(a.count)}</option>)}
      </select></Tooltip>
      <Tooltip name="Pan timeline" description="Move the visible count window without moving the playhead. Use arrow keys while focused. Panning turns follow off." disabledReason="Zoom in to pan the timeline."><input aria-label="Pan timeline" type="range" min={0} max={Math.max(0, duration - span)} step="any" value={view.start} disabled={view.zoom <= 1} onChange={e => { setFollow(false); setStart(Number(e.target.value)); }} /></Tooltip>
      <HelpButton command="score.open" title="Score map" className="button subtle" onClick={()=>controller.dispatch('score.open')}>Score map</HelpButton><HelpButton command="tempo.open" title="Tempo map" className="button subtle" onClick={()=>controller.dispatch('tempo.open')}>Tempo map</HelpButton><HelpButton command="audio.align-open" title="Align recording" className="button subtle" onClick={()=>controller.dispatch('audio.align-open')}>Align recording</HelpButton><label className="microcopy">Ruler<select aria-label="Timeline ruler" value={musicalRuler?'measures':'counts'} onChange={e=>setMusicalRuler(e.target.value==='measures')}><option value="measures">Measures</option><option value="counts">Show counts</option></select></label>
      <span className="timeline-window">{fmt(view.start)}–{fmt(Math.min(duration, view.start + span))}</span>
    </div>}
    <div className="timeline-tracks">
      <div className="track-labels"><span><HelpButton title="Timeline view" description="Show or hide timeline zoom, pan, follow and the all-set picker." aria-expanded={viewOpen} className="timeline-view-toggle" onClick={() => setViewOpen(!viewOpen)}><SlidersHorizontal size={12} />View</HelpButton></span><span><Flag size={12} />SETS</span><ProblemTimelineLabel />{audioName && <span><AudioLines size={12} />AUDIO</span>}</div>
      <div className="timeline-viewport" ref={viewportRef}>
        <div className="tracks">
          <div className="count-ruler">{labels.filter(label=>marks.every(group=>Math.abs(label.count-group[0].count)/span*width>55)).map(label => <span key={label.count} style={{ left: `${percent(label.count)}%` }}>{label.label}</span>)}{marks.map(group=>{const mark=group[0],p=scorePosition(score,mark.count);return <HelpButton key={mark.count} title={group.length===1?`Rehearsal mark ${mark.label}`:`${group.length} rehearsal marks`} description={group.map(m=>`${m.label} · ${scoreLabel(score,m.count)} · count ${m.count}`).join('; ')} className="score-mark" style={{left:`${percent(mark.count)}%`}} onClick={()=>group.length===1?controller.dispatch('score.seek',{measure:p.measure,beat:p.beat}):controller.dispatch('score.open')}>{group.length===1?mark.label:`${group.length} marks`}</HelpButton>;})}</div>
          <div className="set-track">
            {arrivals.filter(a => a.index > 0 && a.count > view.start && a.from < view.start + span).map(a => {
              const left = Math.max(0, percent(a.from)), right = Math.min(100, percent(a.count));
              const pixels = (right - left) / 100 * width;
              return <HelpButton key={a.set.id} command="set.select" showShortcut={false} title={`Set ${a.index + 1}: ${a.set.name}`} description={`Arrive at show count ${a.count}; ${a.counts} move counts. Stop playback and edit this set.`} state={index === a.index ? 'Current set' : 'Available'} aria-current={index === a.index ? 'step' : undefined} className={index === a.index ? 'active' : ''} style={{ left: `${left}%`, width: `${right - left}%` }} onClick={() => selectSet(a.index)}>
                <span>{pixels >= 22 ? String(a.index + 1).padStart(2, '0') : ''}</span>{pixels >= 90 && <span className="timeline-set-name">{a.set.name}</span>}
              </HelpButton>;
            })}
            {view.start === 0 && <HelpButton command="set.select" showShortcut={false} title={`Opening set: ${project.sets[0].name}`} description="Set 1 is the opening picture at show count zero." className={`timeline-opening ${index === 0 ? 'active' : ''}`} onClick={() => selectSet(0)}>01</HelpButton>}
          </div>
          <ProblemTimeline start={view.start} span={span} width={width} />
          {/* Musical labels share the ruler so the field retains its height. */}
          <div className="timeline-music-lanes" />
          {audioName && <div className={`audio-track ${waveform.length ? 'has-audio' : ''}`}><span className="audio-clock-status" role="status">{clockStatus}</span>{waveform.length ? waveform.map((value, i) => {
            const time = (i + .5) / waveform.length * controller.portableAudio.audioDuration - project.audioOffsetSeconds;
            const at = secondsToCount(project, time);
            if (time < 0 || time > countToSeconds(project, duration)) return null;
            return at >= view.start && at <= view.start + span ? <i key={i} style={{ left: `${percent(at)}%`, height: `${Math.max(2, value * 95)}%` }} /> : null;
          }) : <span>{audioLoading ? 'Loading audio…' : 'Audio attached'}</span>}</div>}
          {count >= view.start && count <= view.start + span && <div className="playhead" style={{ left: `${percent(count)}%` }}><i /></div>}
          <input className="timeline-scrubber" type="range" min={view.start} max={Math.min(duration, view.start + span) || 1} step="any" value={Math.max(view.start, Math.min(view.start + span, count))} aria-label="Timeline playhead" aria-valuetext={`Show count ${fmt(count)} · ${scoreLabel(score,Math.min(duration,Math.max(0,count)))}`} onChange={e => scrub(Number(e.target.value))} />
        </div>
      </div>
    </div>
  </>;
}
