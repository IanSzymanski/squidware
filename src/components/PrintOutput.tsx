import { compileTempo, spanSeconds } from '../tempo';
import type { Project } from '../types';
import type { CoordinateOptions } from '../coordinates';
import { COORDINATE_CONVENTIONS, coordinatePrecisionLabel, performerMoveOutput, setTiming, setStartCount } from '../domain';
import { resolvePassage } from '../rehearsal';
import { FieldDrawing } from './Field2D';

export function PrintOutput({ project, mode, paper = 'letter', coordinateFormat }: { project: Project; mode: 'charts' | 'coordinates'; paper?: 'letter' | 'a4'; coordinateFormat?: CoordinateOptions }) {
  const timing=project.tempoMap?compileTempo(project):null;
  const pages=timing?Array.from({length:Math.ceil(timing.spans.length/20)},(_,i)=>timing.spans.slice(i*20,(i+1)*20)):[];
  return <div id="print-output" data-paper={paper}>
    {mode === 'charts' ? project.sets.map((set, index) => <section className="print-page" key={set.id}>
      <header><div><span>SQUIDWARE / FIELD CHART</span><h1>{project.title}</h1><p>{project.ensemble}</p></div><div className="print-set">{String(index + 1).padStart(2, '0')}<small>{set.name}</small></div></header>
      <div className="print-meta"><span>{setTiming(project, index).counts} counts into set</span><span>Cumulative count {setStartCount(project, index)}</span><span>{setTiming(project, index).tempo} {timing?'base BPM · see tempo map':'BPM'}</span><span>{project.performers.length} performers</span></div>
      <svg viewBox="-7 -8 114 69.333" xmlns="http://www.w3.org/2000/svg"><FieldDrawing project={project} positions={set.positions} showLabels showGrid coordinateFormat={coordinateFormat} /></svg>
      <p className="print-notes">{set.notes || 'Rehearsal notes: _________________________________________________________________'}</p>
      <footer>Coordinates in yards. Front sideline is the bottom of the chart. • Squidware</footer>
    </section>) : project.performers.map(performer => <section className="print-page performer-page" key={performer.id}>
      <header><div><span>SQUIDWARE / PERFORMER COORDINATES</span><h1>{performer.label} · {performer.name || 'Performer'}</h1><p>{project.title} / {project.sections.find(s => s.id === performer.sectionId)?.name}</p></div></header>
      <p className="print-coordinate-key">{coordinatePrecisionLabel(coordinateFormat)}. {COORDINATE_CONVENTIONS}</p>
      <table><colgroup><col style={{ width: '18%' }} /><col style={{ width: '7%' }} /><col style={{ width: '35%' }} /><col style={{ width: '40%' }} /></colgroup>
        <thead><tr><th>Set</th><th>Counts</th><th>Arrival coordinate (8-to-5 steps)</th><th>Move into set</th></tr></thead>
        <tbody>{project.sets.map((set, index) => {
          const move = performerMoveOutput(project, index, performer.id, coordinateFormat);
          return <tr key={set.id}><td>{index + 1}. {set.name}</td><td>{move.counts}</td><td>{move.arrival}</td><td>{move.description}</td></tr>;
        })}</tbody>
      </table>
      <footer>Step size is steps per 5 yd: larger numbers mean smaller steps. Eased moves show average and peak sizes. Counts describe the incoming move. • Squidware</footer>
    </section>)}
    {pages.map((spans,page)=><section className="print-page" key={`tempo-${page}`}>
      <header><div><span>SQUIDWARE / TEMPO MAP</span><h1>{project.title}</h1><p>{timing!.totalCounts} counts · {timing!.totalSeconds.toFixed(3)} seconds · page {page+1} of {pages.length}</p></div></header>
      <p>Ranges use absolute show counts. BPM ramps are linear over counts. Fermatas hold positions after that count’s click; recording time continues. Offset: {project.audioOffsetSeconds} seconds.</p>
      <table><thead><tr><th>Show counts</th><th>BPM / fermata</th><th>Start seconds</th><th>Duration seconds</th></tr></thead><tbody>{spans.map((s,i)=><tr key={i}><td>{s.counts?`${s.count}–${s.count+s.counts}`:s.count}</td><td>{s.holdSeconds!==undefined?`Hold ${s.holdSeconds}s`:`${s.tempo!.toFixed(3)} → ${s.endTempo!.toFixed(3)} BPM`}</td><td>{s.seconds.toFixed(6)}</td><td>{spanSeconds(s).toFixed(6)}</td></tr>)}</tbody></table>
      <footer>Arrival at a held count is the beginning of its fermata. Rehearsal speed scales the entire timing map. • Squidware</footer>
    </section>)}
    {project.rehearsal?.map(passage => { const r = resolvePassage(project, passage); return <section className="print-page rehearsal-print-page" key={`rehearsal-${passage.id}`}>
      <header><div><span>SQUIDWARE / REHEARSAL PASSAGE</span><h1>{passage.name}</h1><p>{project.title}</p></div></header>
      <p>{r.error ? `Needs repair: ${r.error}` : `${passage.end ? 'Range' : 'Bookmark'} · show count ${r.start.count}${r.end ? `–${r.end.count}` : ''}`}</p>
      <p>Start: {r.start.label}{r.end ? ` / End: ${r.end.label}` : ''}</p><p>Focus: {r.focus.label} · {r.focus.ids.length} performer{r.focus.ids.length === 1 ? '' : 's'}</p>
      <p className="print-notes">{passage.notes}</p><footer>Saved rehearsal references. Field charts and coordinate sheets retain full-show geometry. • Squidware</footer>
    </section>; })}
  </div>;
}
