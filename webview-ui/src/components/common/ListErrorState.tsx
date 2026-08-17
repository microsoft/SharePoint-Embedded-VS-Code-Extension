import React from 'react';
import type { LoadFailure } from '../../context/StorageExplorerContext';
import { useStorageExplorer } from '../../context/StorageExplorerContext';

const CENTERED: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 12,
    padding: '0 24px',
    textAlign: 'center',
};

/**
 * Shown when a listing failed, in place of the "empty" state.
 *
 * An empty list and a failed load look identical otherwise, and telling the user their
 * folder is empty when the request was actually denied sends them looking for the wrong
 * problem. A missing extension-app permission grant gets its own wording, icon and action
 * because it is fixable from here: the button asks the host to raise the grant prompt
 * directly, rather than retrying the denied call and hoping the host re-diagnoses it.
 */
export function ListErrorState({ error, onRetry }: { error: LoadFailure; onRetry: () => void }) {
    const { grantPermissions, isGrantingPermissions } = useStorageExplorer();
    const isPermissions = error.kind === 'permissions';
    const label = isPermissions
        ? (isGrantingPermissions ? 'Granting…' : 'Grant permissions')
        : 'Retry';
    return (
        <div style={CENTERED} data-testid="list-error" onClick={e => e.stopPropagation()}>
            <span
                className={`codicon ${isPermissions ? 'codicon-shield' : 'codicon-warning'}`}
                style={{ fontSize: 48, color: 'var(--vscode-editorWarning-foreground)' }}
            />
            <span style={{ fontSize: 13, fontWeight: 600 }} data-testid="list-error-title">
                {isPermissions ? 'Permissions required' : 'Something went wrong'}
            </span>
            <span style={{ fontSize: 12, opacity: 0.85, maxWidth: 480 }} data-testid="list-error-message">
                {error.message}
            </span>
            <button
                onClick={isPermissions ? grantPermissions : onRetry}
                disabled={isPermissions && isGrantingPermissions}
                data-testid="list-error-retry"
                style={{
                    padding: '4px 14px',
                    fontSize: 12,
                    cursor: isPermissions && isGrantingPermissions ? 'default' : 'pointer',
                    color: 'var(--vscode-button-foreground)',
                    backgroundColor: 'var(--vscode-button-background)',
                    border: 'none',
                    borderRadius: 2,
                }}
            >
                {label}
            </button>
        </div>
    );
}
