import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';

interface ModalProps {
    title: string;
    confirmLabel: string;
    cancelLabel?: string;
    danger?: boolean;
    confirmDisabled?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    children: React.ReactNode;
}

export function Modal({
    title, confirmLabel, cancelLabel = 'Cancel', danger, confirmDisabled,
    onConfirm, onCancel, children,
}: ModalProps) {
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') onCancel();
        }
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onCancel]);

    return ReactDOM.createPortal(
        <div
            onClick={onCancel}
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
                onClick={e => e.stopPropagation()}
                style={{
                    backgroundColor: 'var(--vscode-editor-background)',
                    border: '1px solid var(--vscode-panel-border)',
                    borderRadius: 6,
                    padding: '20px 24px',
                    minWidth: 340,
                    maxWidth: 480,
                    width: '90%',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                }}
            >
                <h2
                    id="modal-title"
                    style={{
                        margin: 0,
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--vscode-foreground)',
                    }}
                >
                    {title}
                </h2>

                <div>{children}</div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    {cancelLabel && (
                        <button className="action-btn" onClick={onCancel}>
                            {cancelLabel}
                        </button>
                    )}
                    <button
                        className="action-btn"
                        disabled={confirmDisabled}
                        onClick={onConfirm}
                        style={
                            danger && !confirmDisabled
                                ? { color: 'var(--vscode-errorForeground)', borderColor: 'var(--vscode-errorForeground)' }
                                : undefined
                        }
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
