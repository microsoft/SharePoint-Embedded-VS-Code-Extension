import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { StorageItem, SidePanelTab, ModalState } from '../../models/StorageItem';
import { useStorageExplorer } from '../../context/StorageExplorerContext';

interface MenuAction {
    icon: string;
    label: string;
    dividerBefore?: boolean;
    danger?: boolean;
    onClick: () => void;
}

function getActions(
    item: StorageItem,
    onClose: () => void,
    openTab: (tab: SidePanelTab) => void,
    openModal: (state: ModalState) => void,
    navigateToContainerRecycleBin: (containerId: string, containerName: string) => void
): MenuAction[] {
    const rename: MenuAction = { icon: 'codicon-edit', label: 'Rename', onClick: () => { onClose(); openModal({ kind: 'rename', item }); } };
    const del: MenuAction = { icon: 'codicon-trash', label: 'Delete', danger: true, onClick: () => { onClose(); openModal({ kind: 'delete', item }); } };
    const perms: MenuAction = {
        icon: 'codicon-account', label: 'Permissions',
        onClick: () => { onClose(); openTab('permissions'); },
    };
    const metadata: MenuAction = {
        icon: 'codicon-tag', label: 'Metadata',
        onClick: () => { onClose(); openTab('metadata'); },
    };
    const properties: MenuAction = {
        icon: 'codicon-info', label: 'Properties',
        onClick: () => { onClose(); openTab('properties'); },
    };

    if (item.kind === 'file') {
        const versions: MenuAction = {
            icon: 'codicon-history', label: 'Versions',
            onClick: () => { onClose(); openTab('versions'); },
        };
        return [
            { icon: 'codicon-eye', label: 'Preview', onClick: () => { onClose(); /* TODO */ } },
            { icon: 'codicon-globe', label: 'Open in web browser', onClick: () => { onClose(); /* TODO */ } },
            { icon: 'codicon-desktop-download', label: 'Open in desktop app', onClick: () => { onClose(); /* TODO */ } },
            { icon: 'codicon-cloud-download', label: 'Download', onClick: () => { onClose(); /* TODO */ } },
            { ...rename, dividerBefore: true },
            del,
            { ...perms, dividerBefore: true },
            metadata,
            versions,
            properties,
        ];
    }

    if (item.kind === 'folder') {
        return [
            rename,
            del,
            { ...perms, dividerBefore: true },
            metadata,
            properties,
        ];
    }

    // container
    const columns: MenuAction = {
        icon: 'codicon-list-tree', label: 'Columns',
        onClick: () => { onClose(); openTab('columns'); },
    };
    const recycleBin: MenuAction = {
        icon: 'codicon-trash', label: 'Recycle bin', dividerBefore: true,
        onClick: () => { onClose(); navigateToContainerRecycleBin(item.id, item.name); },
    };
    return [
        rename,
        del,
        recycleBin,
        { ...perms, dividerBefore: true },
        columns,
        metadata,
        properties,
    ];
}

interface ContextMenuProps {
    item: StorageItem;
    x: number;
    y: number;
    onClose: () => void;
}

export function ContextMenu({ item, x, y, onClose }: ContextMenuProps) {
    const { setSidePanelTab, openModal, navigateToContainerRecycleBin } = useStorageExplorer();
    const ref = useRef<HTMLDivElement>(null);

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

    const actions = getActions(item, onClose, setSidePanelTab, openModal, navigateToContainerRecycleBin);

    // Clamp to viewport
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
