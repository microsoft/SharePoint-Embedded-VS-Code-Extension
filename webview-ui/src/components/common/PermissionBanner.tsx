import React from 'react';
import { useStorageExplorer } from '../../context/StorageExplorerContext';

/**
 * Always-on notice that the extension app's grant on this container type is incomplete.
 *
 * Disabled buttons and the per-action modal only explain themselves once the user reaches
 * for the action they cannot use. That leaves the states nobody clicks — most importantly a
 * listing that comes back empty — reading as "there is nothing here" when the real answer is
 * "you are not allowed to see it". This banner keeps the partial grant visible for as long
 * as it lasts, names the exact scopes, and offers the same grant prompt the denied paths do.
 */
export function PermissionBanner() {
    const { missingScopes, grantPermissions, isGrantingPermissions } = useStorageExplorer();

    if (missingScopes.length === 0) {
        return null;
    }

    return (
        <div
            data-testid="permission-banner"
            role="status"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 10px',
                fontSize: 12,
                flexShrink: 0,
                borderBottom: '1px solid var(--vscode-panel-border)',
                color: 'var(--vscode-inputValidation-warningForeground, inherit)',
                backgroundColor: 'var(--vscode-inputValidation-warningBackground)',
            }}
        >
            <span className="codicon codicon-shield" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
                Some actions are disabled. The SharePoint Embedded extension app is missing the{' '}
                <strong data-testid="permission-banner-scopes">{missingScopes.join(', ')}</strong>{' '}
                app {missingScopes.length === 1 ? 'permission' : 'permissions'} on this container
                type. Results may also be incomplete.
            </span>
            <button
                type="button"
                data-testid="permission-banner-grant"
                onClick={grantPermissions}
                disabled={isGrantingPermissions}
                style={{
                    flexShrink: 0,
                    padding: '2px 10px',
                    fontSize: 12,
                    cursor: isGrantingPermissions ? 'default' : 'pointer',
                    color: 'var(--vscode-button-foreground)',
                    backgroundColor: 'var(--vscode-button-background)',
                    border: 'none',
                    borderRadius: 2,
                }}
            >
                {isGrantingPermissions ? 'Granting…' : 'Grant permissions'}
            </button>
        </div>
    );
}
