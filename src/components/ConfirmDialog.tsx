import { useId } from 'react';
import { Modal } from './Modal';
import type { ConfirmationRequest } from '../editor/confirmation';

/** In-app replacement for window.confirm. Plain buttons keep focus help off
 * the choices; focus starts on the safe choice. Render it as a sibling of
 * other dialogs so Escape cancels only this confirmation. */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel = 'Cancel', tone = 'danger', onCancel, onConfirm }: ConfirmationRequest & { onCancel: () => void; onConfirm: () => void }) {
  const messageId = useId();
  // An alert dialog named by its title and described by its consequence, as window.confirm read its message aloud.
  return <Modal title={title} className="confirm-dialog" role="alertdialog" describedBy={messageId} onClose={onCancel}>
    <p id={messageId} className="modal-intro">{message}</p>
    <div className="modal-actions"><button className="button subtle confirm-dialog__cancel" data-autofocus onClick={onCancel}>{cancelLabel}</button><button className={`button ${tone} confirm-dialog__confirm`} onClick={onConfirm}>{confirmLabel}</button></div>
  </Modal>;
}
