import type { Project } from '../types';
import type { CoordinateOptions } from '../coordinates';
import { COORDINATE_CONVENTIONS, coordinatePrecisionLabel, performerMoveOutput, setTiming, setStartCount } from '../domain';
import { FieldDrawing } from './Field2D';

export function PrintOutput({ project, mode, paper = 'letter', coordinateFormat }: { project: Project; mode: 'charts' | 'coordinates'; paper?: 'letter' | 'a4'; coordinateFormat?: CoordinateOptions }) {
  return <div id="print-output" data-paper={paper}>
    {mode === 'charts' ? project.sets.map((set, index) => <section className="print-page" key={set.id}>
      <header><div><span>SQUIDWARE / FIELD CHART</span><h1>{project.title}</h1><p>{project.ensemble}</p></div><div className="print-set">{String(index + 1).padStart(2, '0')}<small>{set.name}</small></div></header>
      <div className="print-meta"><span>{setTiming(project, index).counts} counts into set</span><span>Cumulative count {setStartCount(project, index)}</span><span>{setTiming(project, index).tempo} BPM</span><span>{project.performers.length} performers</span></div>
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
  </div>;
}
