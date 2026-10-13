import type { Project } from '../types';
import { setTiming,  coordinateDescription, setStartCount } from '../domain';
import { FieldDrawing } from './Field2D';

export function PrintOutput({ project, mode }: { project: Project; mode: 'charts' | 'coordinates' }) {
  return <div id="print-output">
    {mode === 'charts' ? project.sets.map((set, index) => <section className="print-page" key={set.id}>
      <header><div><span>SQUIDWARE / FIELD CHART</span><h1>{project.title}</h1><p>{project.ensemble}</p></div><div className="print-set">{String(index + 1).padStart(2, '0')}<small>{set.name}</small></div></header>
      <div className="print-meta"><span>{setTiming(project, index).counts} counts into set</span><span>Cumulative count {setStartCount(project, index)}</span><span>{setTiming(project, index).tempo} BPM</span><span>{project.performers.length} performers</span></div>
      <svg viewBox="-7 -8 114 69.333" xmlns="http://www.w3.org/2000/svg"><FieldDrawing project={project} positions={set.positions} showLabels showGrid /></svg>
      <p className="print-notes">{set.notes || 'Rehearsal notes: _________________________________________________________________'}</p>
      <footer>Coordinates in yards. Front sideline is the bottom of the chart. • Squidware</footer>
    </section>) : project.performers.map(performer => <section className="print-page performer-page" key={performer.id}>
      <header><div><span>SQUIDWARE / PERFORMER COORDINATES</span><h1>{performer.label} · {performer.name || 'Performer'}</h1><p>{project.title} / {project.sections.find(s => s.id === performer.sectionId)?.name}</p></div></header>
      <table><thead><tr><th>Set</th><th>Counts</th><th>Position (8-to-5 steps)</th></tr></thead><tbody>{project.sets.map((set, index) => <tr key={set.id}><td>{index + 1}. {set.name}</td><td>{setTiming(project, index).counts}</td><td>{coordinateDescription(set.positions[performer.id], project.field)}</td></tr>)}</tbody></table>
      <footer>Side 1 = left half on the chart. Side 2 = right half. Front = bottom. • Squidware</footer>
    </section>)}
  </div>;
}
