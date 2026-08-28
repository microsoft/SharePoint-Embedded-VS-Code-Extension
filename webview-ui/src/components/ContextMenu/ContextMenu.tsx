import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { StorageItem, SidePanelTab, ModalState } from '../../models/StorageItem';
import { useStorageExplorer } from '../../context/StorageExplorerContext';
import { openUrl } from '../../utils/openUrl';
import type { StorageExplorerOperation } from '../../api/protocol';

interface MenuAction {
    icon: string;
    label: string;
    dividerBefore?: boolean;
    danger?: boolean;
    permissionOperation?: StorageExplorerOperation;
    onClick: () => void;
}

function getActions(
    item: StorageItem,
    onClose: () => void,
    openTab: (tab: SidePanelTab) => void,
    openModal: (state: ModalState) => void,
    navigateToContainerRecycleBin: (containerId: string, containerName: string) => void,
    activateContainer: (containerId: string) => Promise<void>,
    previewItem: (item: StorageItem) => Promise<void>,
    downloadItem: (item: StorageItem) => Promise<void>,
    openInDesktopApp: (item: StorageItem) => Promise<void>
): MenuAction[] {
    const rename: MenuAction = {
        icon: 'codicon-edit', label: 'Rename',
        permissionOperation: item.kind === 'container' ? 'containers.rename' : 'drive.rename',
        onClick: () => { onClose(); openModal({ kind: 'rename', item }); },
    };
    const del: MenuAction = {
        icon: 'codicon-trash', label: 'Delete', danger: true,
        permissionOperation: item.kind === 'container' ? 'containers.delete' : 'drive.delete',
        onClick: () => { onClose(); openModal({ kind: 'delete', item }); },
    };
    const perms: MenuAction = {
        icon: 'codicon-account', label: 'Permissions',
        permissionOperation: item.kind === 'container'
            ? 'permissions.listContainerPermissions'
            : 'permissions.listItemPermissions',
        onClick: () => { onClose(); openTab('permissions'); },
    };
    const metadata: MenuAction = {
        icon: 'codicon-tag', label: 'Metadata',
        permissionOperation: item.kind === 'container'
            ? 'containers.getCustomProperties'
            : 'columns.getItemFields',
        onClick: () => { onClose(); openTab('metadata'); },
    };
    const properties: MenuAction = {
        icon: 'codicon-info', label: 'Properties',
        permissionOperation: item.kind === 'container' ? 'containers.get' : 'drive.getDetailedDriveItem',
        onClick: () => { onClose(); openTab('properties'); },
    };

    if (item.kind === 'file') {
        const versions: MenuAction = {
            icon: 'codicon-history', label: 'Versions',
            permissionOperation: 'drive.listVersions',
            onClick: () => { onClose(); openTab('versions'); },
        };
        return [
            { icon: 'codicon-eye', label: 'Preview', permissionOperation: 'drive.getPreviewUrl', onClick: () => { onClose(); previewItem(item); } },
            { icon: 'codicon-globe', label: 'Open in browser', permissionOperation: 'drive.getPreviewUrl', onClick: () => { onClose(); item.webUrl && openUrl(item.webUrl); } },
            { icon: 'codicon-desktop-download', label: 'Open in desktop', permissionOperation: 'drive.getItemWebUrl', onClick: () => { onClose(); openInDesktopApp(item); } },
            { icon: 'codicon-cloud-download', label: 'Download', permissionOperation: 'drive.getDownloadUrl', onClick: () => { onClose(); downloadItem(item); } },
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
        permissionOperation: 'columns.listContainerColumns',
        onClick: () => { onClose(); openTab('columns'); },
    };
    const settings: MenuAction = {
        icon: 'codicon-settings-gear', label: 'Settings',
        permissionOperation: 'containers.getSettings',
        onClick: () => { onClose(); openTab('settings'); },
    };
    const recycleBin: MenuAction = {
        icon: 'codicon-trash', label: 'Recycle bin', dividerBefore: true,
        permissionOperation: 'drive.listRecycleBin',
        onClick: () => { onClose(); navigateToContainerRecycleBin(item.id, item.name); },
    };
    const activate: MenuAction = {
        icon: 'codicon-play', label: 'Activate',
        permissionOperation: 'containers.activate',
        onClick: () => { onClose(); void activateContainer(item.id); },
    };
    return [
        ...(item.status === 'inactive' ? [activate] : []),
        rename,
        del,
        recycleBin,
        { ...perms, dividerBefore: true },
        columns,
        metadata,
        settings,
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
    const {
        setSidePanelTab, openModal, navigateToContainerRecycleBin, activateContainer,
        previewItem, downloadItem, openInDesktopApp, missingPermissionMessage, requireOperation,
    } = useStorageExplorer();
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

    const actions = getActions(item, onClose, setSidePanelTab, openModal, navigateToContainerRecycleBin, activateContainer, previewItem, downloadItem, openInDesktopApp);

    // Clamp to viewport
    const maxX = Math.min(x, window.innerWidth - 210);
    const maxY = Math.min(y, window.innerHeight - actions.length * 34 - 16);

    return ReactDOM.createPortal(
        <div
            ref={ref}
            data-testid="context-menu"
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
                        data-testid={`context-menu-item-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
                        aria-disabled={!!(
                            action.permissionOperation
                            && missingPermissionMessage(action.permissionOperation)
                        )}
                        title={action.permissionOperation
                            ? missingPermissionMessage(action.permissionOperation) ?? action.label
                            : action.label}
                        onClick={() => {
                            // A denied action still dismisses the menu. It has already explained
                            // itself through the permission notice, and leaving the menu mounted
                            // traps the pointer over the rest of the view — including the banner's
                            // own "Grant permissions" button, the one control that resolves it.
                            if (action.permissionOperation && !requireOperation(action.permissionOperation)) {
                                onClose();
                                return;
                            }
                            action.onClick();
                        }}
                        style={action.permissionOperation && missingPermissionMessage(action.permissionOperation)
                            ? { opacity: 0.45, cursor: 'not-allowed' }
                            : undefined}
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
