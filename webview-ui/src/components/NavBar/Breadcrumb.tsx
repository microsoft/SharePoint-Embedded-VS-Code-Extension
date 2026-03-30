import React from 'react';
import { useStorageExplorer } from '../../context/StorageExplorerContext';

export function Breadcrumb() {
    const { path, navigateToBreadcrumb } = useStorageExplorer();

    return (
        <nav style={{ display: 'flex', alignItems: 'center', gap: 2, overflow: 'hidden', minWidth: 0 }}>
            {path.map((entry, i) => {
                const isLast = i === path.length - 1;
                return (
                    <React.Fragment key={`${entry.id ?? 'root'}-${i}`}>
                        {i > 0 && (
                            <span
                                className="codicon codicon-chevron-right"
                                style={{ fontSize: 12, opacity: 0.5, flexShrink: 0 }}
                            />
                        )}
                        <button
                            style={{
                                background: 'none',
                                border: 'none',
                                padding: '2px 4px',
                                borderRadius: 3,
                                cursor: isLast ? 'default' : 'pointer',
                                color: isLast
                                    ? 'var(--vscode-breadcrumb-activeSelectionForeground, var(--vscode-foreground))'
                                    : 'var(--vscode-breadcrumb-foreground, var(--vscode-foreground))',
                                fontFamily: 'var(--vscode-font-family)',
                                fontSize: 'var(--vscode-font-size)',
                                fontWeight: isLast ? 500 : 400,
                                opacity: isLast ? 1 : 0.8,
                                maxWidth: 160,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                            onClick={() => !isLast && navigateToBreadcrumb(i)}
                            title={entry.label}
                        >
                            {entry.label}
                        </button>
                    </React.Fragment>
                );
            })}
        </nav>
    );
}
