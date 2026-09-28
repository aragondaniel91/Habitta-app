import { useCallback, useId, useRef } from 'react';
import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react';
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
  /** Requires an explicit activation of the marked confirm action for Enter to proceed. */
  requireExplicitConfirm?: boolean;
};

type EnterTarget = Pick<HTMLElement, 'closest'>;

/**
 * A destructive dialog must not accept an unintentional Enter from its container
 * or passive content. Interactive children keep their native Enter behavior:
 * they may use it for text input, navigation, or their own action.
 */
export function shouldPreventAccidentalDestructiveEnter(
  key: string,
  target: EnterTarget,
  requireExplicitConfirm: boolean,
) {
  if (key !== 'Enter' || !requireExplicitConfirm) return false;

  return !target.closest(
    '[data-confirm-dialog-action], button, a[href], input, textarea, select, [contenteditable="true"], [role="button"], [role="link"], [role="textbox"], [role="combobox"], [role="menuitem"]',
  );
}

export function Dialog({
  title,
  eyebrow,
  description,
  onClose,
  children,
  size = 'md',
  closeDisabled = false,
  requireExplicitConfirm = false,
}: DialogProps) {
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const requestClose = useCallback(() => {
    if (!closeDisabled) onClose();
  }, [closeDisabled, onClose]);
  const preventAccidentalDestructiveEnter = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (
        shouldPreventAccidentalDestructiveEnter(
          event.key,
          event.target as HTMLElement,
          requireExplicitConfirm,
        )
      ) {
        event.preventDefault();
      }
    },
    [requireExplicitConfirm],
  );

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
        onKeyDownCapture={preventAccidentalDestructiveEnter}
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
            data-confirm-dialog-action="cancel"
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
      {...(destructive ? { eyebrow: 'Confirmación requerida' } : {})}
      onClose={onCancel}
      requireExplicitConfirm={destructive}
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
          data-confirm-dialog-action="cancel"
          disabled={busy}
          onClick={onCancel}
          type="button"
          variant="secondary"
        >
          {cancelLabel}
        </Button>
        <Button
          autoFocus={!destructive}
          data-confirm-dialog-action="confirm"
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
