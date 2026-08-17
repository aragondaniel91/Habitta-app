import { useCallback, useId, useRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { useDialogBehavior } from './Drawer';
import { Button } from './ui';
import '../app-dialog.css';

type DialogProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeDisabled?: boolean;
};

export function Dialog({
  title,
  eyebrow,
  description,
  onClose,
  children,
  size = 'md',
  closeDisabled = false,
}: DialogProps) {
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const requestClose = useCallback(() => {
    if (!closeDisabled) onClose();
  }, [closeDisabled, onClose]);

  useDialogBehavior(panel, requestClose);

  return (
    <div className="app-dialog-layer" role="presentation">
      <button
        aria-label="Cerrar diálogo"
        className="app-dialog-backdrop"
        disabled={closeDisabled}
        onClick={requestClose}
        tabIndex={-1}
        type="button"
      />
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="app-dialog"
        data-size={size}
        ref={panel}
        role="dialog"
        tabIndex={-1}
      >
        <header className="app-dialog__header">
          <div className="app-dialog__heading">
            {eyebrow ? <span className="app-dialog__eyebrow">{eyebrow}</span> : null}
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <Button
            aria-label="Cerrar"
            className="app-dialog__close"
            disabled={closeDisabled}
            onClick={requestClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            <span aria-hidden="true">×</span>
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['app-dialog__body', className].filter(Boolean).join(' ')} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['app-dialog__footer', className].filter(Boolean).join(' ')} />;
}

type ConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  cancelLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  destructive?: boolean;
  children?: ReactNode;
};

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  cancelLabel = 'Cancelar',
  busy = false,
  busyLabel = 'Procesando…',
  destructive = false,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      closeDisabled={busy}
      description={description}
      eyebrow={destructive ? 'Confirmación requerida' : undefined}
      onClose={onCancel}
      size="sm"
      title={title}
    >
      <DialogBody>
        {children}
        {destructive ? (
          <div className="app-dialog__danger-note" role="note">
            Esta acción no se puede deshacer.
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button
          autoFocus={destructive}
          disabled={busy}
          onClick={onCancel}
          type="button"
          variant="secondary"
        >
          {cancelLabel}
        </Button>
        <Button
          autoFocus={!destructive}
          disabled={busy}
          onClick={onConfirm}
          type="button"
          variant={destructive ? 'danger' : 'primary'}
        >
          {busy ? busyLabel : confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
