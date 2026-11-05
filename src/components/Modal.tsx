import { HelpButton } from '../editor/ControlHelp';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, onClose, children, wide = false, className = '' }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  // showModal focuses the first control (Close); [data-autofocus] opts a dialog into a safer starting control.
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus(); return () => { dialog?.close(); }; }, []);
  // React passes cancel up its tree; stop it so a nested Modal never closes its ancestor.
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''} ${className}`} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-header"><h2>{title}</h2><HelpButton title="Close dialog" description="Close this dialog and return to the editor." className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></HelpButton></div>
    {children}
  </dialog>;
}
