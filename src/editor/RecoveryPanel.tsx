import { Modal } from '../components/Modal';
import type { useRecoveryController } from './useRecoveryController';
const copyTime = (createdAt: number) => new Date(createdAt).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
export function RecoveryPanel({ recovery, onClose }: { recovery: ReturnType<typeof useRecoveryController>; onClose: () => void }) {
  return <Modal title="Recovery copies" onClose={onClose}>
    <p className="modal-intro">Automatic copies on this device help recover interrupted work. Choose the production and time you want to restore, then use Save for a project file.</p>
    <p className="recovery-status" role="status">{recovery.busy ? 'Opening recovery…' : recovery.status}</p>
    {recovery.error && <p className="recovery-error" role="alert">{recovery.error}</p>}
    {recovery.warnings.map(warning => <p className="recovery-error" key={warning}>{warning}</p>)}
    <ol className="recovery-list">{recovery.versions.map((copy, index) => <li key={copy.id}>
      <div><strong>{copy.title}</strong><time dateTime={new Date(copy.createdAt).toISOString()}>{copyTime(copy.createdAt)}</time><span>{copy.performers} performers · {copy.sets} sets{copy.source === 'legacy' ? ' · Migrated browser copy' : ''}{index === 0 ? ' · Most recent' : ''}</span></div>
      <button className="button subtle" disabled={recovery.busy} onClick={() => void recovery.restore(copy.id)}>Restore<span className="sr-only"> {copy.title} from {copyTime(copy.createdAt)}</span></button>
    </li>)}</ol>
    {!recovery.versions.length && <p className="microcopy">No readable recovery copies yet. Copies start after your first committed change.</p>}
    <p className="history-policy">Desktop: up to 20 most recent copies or 100 MiB across productions. The newest valid copy is always kept. Older copies expire; unreadable originals and legacy sources are preserved. Browser preview: up to 20 copies, subject to browser storage limits.</p>
    <div className="modal-actions"><button className="button subtle" disabled={recovery.busy} onClick={() => void recovery.refresh()}>Retry / refresh copies</button><button className="button primary" onClick={onClose}>Continue editing</button></div>
  </Modal>;
}
