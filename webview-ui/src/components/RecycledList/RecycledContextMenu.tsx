import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { StorageItem } from '../../models/StorageItem';
import { useStorageExplorer } from '../../context/StorageExplorerContext';

interface RecycledContextMenuProps {
    item: StorageItem;
    x: number;
    y: number;
    onClose: () => void;
}

export function RecycledContextMenu({ item, x, y, onClose }: RecycledContextMenuProps) {
    const { setSidePanelTab, openModal, viewMode, restoreContainer, restoreRecycledItem } = useStorageExplorer();
    const ref = useRef<HTMLDivElement>(null);

    function handleRestore() {
        onClose();
        if (viewMode.kind === 'container-recycle-bin') {
            restoreRecycledItem(item).catch(console.error);
        } else {
            restoreContainer(item.id).catch(console.error);
        }
    }

    useEffect(() => {
        function handleMouseDown(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        }
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    const actions = [
        { icon: 'codicon-redo', label: 'Restore', danger: false, onClick: handleRestore },
        { icon: 'codicon-trash', label: 'Permanently delete', danger: true, dividerAfter: true, onClick: () => { onClose(); openModal({ kind: 'permanently-delete' as const, item }); } },
        { icon: 'codicon-info', label: 'Properties', danger: false, dividerBefore: true, onClick: () => { onClose(); setSidePanelTab('properties'); } },
    ];

    const maxX = Math.min(x, window.innerWidth - 210);
    const maxY = Math.min(y, window.innerHeight - actions.length * 34 - 16);

    return ReactDOM.createPortal(
        <div
            ref={ref}
            onClick={e => e.stopPropagation()}
            style={{
                position: 'fixed',
                left: maxX,
                top: maxY,
                minWidth: 200,
                backgroundColor: 'var(--vscode-menu-background)',
                border: '1px solid var(--vscode-menu-border, var(--vscode-panel-border))',
                borderRadius: 4,
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                zIndex: 9999,
                padding: '4px 0',
            }}
        >
            {actions.map((action, i) => (
                <React.Fragment key={i}>
                    {action.dividerBefore && (
                        <div style={{ height: 1, backgroundColor: 'var(--vscode-menu-separatorBackground, var(--vscode-panel-border))', margin: '4px 0' }} />
                    )}
                    <button
                        className={`menu-item${action.danger ? ' danger' : ''}`}
                        onClick={action.onClick}
                    >
                        <span className={`codicon ${action.icon}`} />
                        {action.label}
                    </button>
                </React.Fragment>
            ))}
        </div>,
        document.body
    );
}
