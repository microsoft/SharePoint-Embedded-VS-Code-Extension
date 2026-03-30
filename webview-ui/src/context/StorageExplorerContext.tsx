import React, { createContext, useContext, useState, useMemo } from 'react';
import { StorageItem, BreadcrumbEntry, SortColumn, SortDirection, SidePanelTab, ModalState, ViewMode } from '../models/StorageItem';
import { ROOT_ITEMS, ITEMS_BY_ID, DUMMY_APP_INFO, DELETED_CONTAINERS, RECYCLED_ITEMS_BY_CONTAINER_ID } from '../data/dummyData';

interface StorageExplorerContextValue {
    appName: string;
    tenantDomain: string;
    path: BreadcrumbEntry[];
    viewMode: ViewMode;
    currentItems: StorageItem[];
    currentRecycledItems: StorageItem[];
    selectedItem: StorageItem | null;
    sortColumn: SortColumn;
    sortDirection: SortDirection;
    sidePanelOpen: boolean;
    sidePanelTab: SidePanelTab;
    navigate: (item: StorageItem) => void;
    navigateToBreadcrumb: (index: number) => void;
    navigateToDeletedContainers: () => void;
    navigateToContainerRecycleBin: (containerId: string, containerName: string) => void;
    selectItem: (item: StorageItem | null) => void;
    setSort: (col: SortColumn) => void;
    setSidePanelTab: (tab: SidePanelTab) => void;
    toggleSidePanel: () => void;
    modal: ModalState | null;
    openModal: (state: ModalState) => void;
    closeModal: () => void;
    retentionOverrides: Record<string, number | null>;
    setRetentionOverride: (containerId: string, days: number | null) => void;
}

const StorageExplorerContext = createContext<StorageExplorerContextValue | null>(null);

export function StorageExplorerProvider({ children }: { children: React.ReactNode }) {
    const [path, setPath] = useState<BreadcrumbEntry[]>([
        { label: DUMMY_APP_INFO.name, id: null }
    ]);
    const [selectedItem, setSelectedItem] = useState<StorageItem | null>(null);
    const [sortColumn, setSortColumnState] = useState<SortColumn>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [sidePanelOpen, setSidePanelOpen] = useState(true);
    const [sidePanelTab, setSidePanelTabState] = useState<SidePanelTab>('permissions');
    const [modal, setModal] = useState<ModalState | null>(null);
    const [retentionOverrides, setRetentionOverridesState] = useState<Record<string, number | null>>({});

    const lastId = path[path.length - 1]?.id ?? null;

    const viewMode = useMemo((): ViewMode => {
        if (lastId === '__deleted_containers') return { kind: 'deleted-containers' };
        if (lastId === '__recyclebin__') {
            const containerId = path[path.length - 2]?.id;
            if (containerId) return { kind: 'container-recycle-bin', containerId };
        }
        return { kind: 'normal' };
    }, [lastId, path]);

    const currentItems = useMemo(() => {
        if (viewMode.kind !== 'normal') return [];
        const raw = lastId === null ? ROOT_ITEMS : (ITEMS_BY_ID[lastId] ?? []);
        const kindOrder: Record<string, number> = { container: 0, folder: 1, file: 2 };

        return [...raw].sort((a, b) => {
            // Containers and folders always sort before files
            const kindCmp = (kindOrder[a.kind] ?? 2) - (kindOrder[b.kind] ?? 2);
            if (kindCmp !== 0) return kindCmp;

            let cmp = 0;
            switch (sortColumn) {
                case 'name': cmp = a.name.localeCompare(b.name); break;
                case 'modified': cmp = a.modifiedAt.localeCompare(b.modifiedAt); break;
                case 'type': cmp = a.type.localeCompare(b.type); break;
                case 'size': cmp = a.size.localeCompare(b.size, undefined, { numeric: true }); break;
            }
            return sortDirection === 'asc' ? cmp : -cmp;
        });
    }, [lastId, viewMode, sortColumn, sortDirection]);

    const currentRecycledItems = useMemo(() => {
        if (viewMode.kind === 'normal') return [];
        const raw = viewMode.kind === 'deleted-containers'
            ? DELETED_CONTAINERS
            : (RECYCLED_ITEMS_BY_CONTAINER_ID[viewMode.containerId] ?? []);
        return [...raw].sort((a, b) => {
            let cmp = 0;
            switch (sortColumn) {
                case 'name': cmp = a.name.localeCompare(b.name); break;
                case 'modified': cmp = a.modifiedAt.localeCompare(b.modifiedAt); break;
                case 'type': cmp = a.type.localeCompare(b.type); break;
                default: break;
            }
            return sortDirection === 'asc' ? cmp : -cmp;
        });
    }, [viewMode, sortColumn, sortDirection]);

    function navigate(item: StorageItem) {
        if (item.kind === 'file') return;
        setPath(prev => [...prev, { label: item.name, id: item.id }]);
        setSelectedItem(null);
    }

    function navigateToBreadcrumb(index: number) {
        setPath(prev => prev.slice(0, index + 1));
        setSelectedItem(null);
    }

    function navigateToDeletedContainers() {
        setPath([path[0], { label: 'Deleted containers', id: '__deleted_containers' }]);
        setSelectedItem(null);
    }

    function navigateToContainerRecycleBin(containerId: string, containerName: string) {
        setPath([path[0], { label: containerName, id: containerId }, { label: 'Recycle bin', id: '__recyclebin__' }]);
        setSelectedItem(null);
    }

    function selectItem(item: StorageItem | null) {
        setSelectedItem(item);
    }

    function setSort(col: SortColumn) {
        if (col === sortColumn) {
            setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortColumnState(col);
            setSortDirection('asc');
        }
    }

    function setSidePanelTab(tab: SidePanelTab) {
        setSidePanelTabState(tab);
        setSidePanelOpen(true);
    }

    function toggleSidePanel() {
        setSidePanelOpen(o => !o);
    }

    function openModal(state: ModalState) {
        setModal(state);
    }

    function closeModal() {
        setModal(null);
    }

    function setRetentionOverride(containerId: string, days: number | null) {
        setRetentionOverridesState(prev => ({ ...prev, [containerId]: days }));
    }

    const value: StorageExplorerContextValue = {
        appName: DUMMY_APP_INFO.name,
        tenantDomain: DUMMY_APP_INFO.tenantDomain,
        path,
        viewMode,
        currentItems,
        currentRecycledItems,
        selectedItem,
        sortColumn,
        sortDirection,
        sidePanelOpen,
        sidePanelTab,
        navigate,
        navigateToBreadcrumb,
        navigateToDeletedContainers,
        navigateToContainerRecycleBin,
        selectItem,
        setSort,
        setSidePanelTab,
        toggleSidePanel,
        modal,
        openModal,
        closeModal,
        retentionOverrides,
        setRetentionOverride,
    };

    return (
        <StorageExplorerContext.Provider value={value}>
            {children}
        </StorageExplorerContext.Provider>
    );
}

export function useStorageExplorer(): StorageExplorerContextValue {
    const ctx = useContext(StorageExplorerContext);
    if (!ctx) throw new Error('useStorageExplorer must be used inside StorageExplorerProvider');
    return ctx;
}
