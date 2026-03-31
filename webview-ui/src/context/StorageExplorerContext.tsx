import React, { createContext, useCallback, useContext, useRef, useState, useMemo } from 'react';
import { StorageItem, BreadcrumbEntry, SortColumn, SortDirection, SidePanelTab, ModalState, ViewMode, NetworkRequest, UploadFile, UploadStatus } from '../models/StorageItem';
import { ROOT_ITEMS, ITEMS_BY_ID, DUMMY_APP_INFO, DELETED_CONTAINERS, RECYCLED_ITEMS_BY_CONTAINER_ID, DUMMY_NETWORK_REQUESTS } from '../data/dummyData';

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
    networkRequests: NetworkRequest[];
    networkDrawerOpen: boolean;
    toggleNetworkDrawer: () => void;
    clearNetworkRequests: () => void;
    logNetworkRequest: (req: NetworkRequest) => void;
    // ── uploads ──
    uploads: UploadFile[];
    uploadCardOpen: boolean;
    enqueueUploads: (files: FileList | File[]) => void;
    pauseUpload: (id: string) => void;
    resumeUpload: (id: string) => void;
    cancelUpload: (id: string) => void;
    retryUpload: (id: string) => void;
    dismissUpload: (id: string) => void;
    dismissAllCompleted: () => void;
    closeUploadCard: () => void;
    toggleUploadCard: () => void;
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
    const [networkRequests, setNetworkRequests] = useState<NetworkRequest[]>(DUMMY_NETWORK_REQUESTS);
    const [networkDrawerOpen, setNetworkDrawerOpen] = useState(false);
    // ── upload state ──
    const [uploads, setUploads] = useState<UploadFile[]>([]);
    const [uploadCardOpen, setUploadCardOpen] = useState(false);
    // Map of upload id → interval handle for simulation
    const uploadTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

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

    function toggleNetworkDrawer() {
        setNetworkDrawerOpen(o => !o);
    }

    function clearNetworkRequests() {
        setNetworkRequests([]);
    }

    function logNetworkRequest(req: NetworkRequest) {
        setNetworkRequests(prev => [...prev, req]);
    }

    // ── upload helpers ────────────────────────────────────────────────────────

    function startSimulation(id: string) {
        if (uploadTimers.current[id]) return;
        uploadTimers.current[id] = setInterval(() => {
            setUploads(prev => prev.map(u => {
                if (u.id !== id || u.status !== 'uploading') return u;
                // Advance by a random 2–6% of total per tick
                const chunk = Math.floor(u.size * (0.02 + Math.random() * 0.04));
                const next = Math.min(u.uploaded + chunk, u.size);
                if (next >= u.size) {
                    clearInterval(uploadTimers.current[id]);
                    delete uploadTimers.current[id];
                    return { ...u, uploaded: u.size, status: 'completed' as UploadStatus };
                }
                // ~5% chance of a transient failure for demo realism
                if (Math.random() < 0.03) {
                    clearInterval(uploadTimers.current[id]);
                    delete uploadTimers.current[id];
                    return { ...u, status: 'failed' as UploadStatus, error: 'Network error. Click Retry to try again.' };
                }
                return { ...u, uploaded: next };
            }));
        }, 300);
    }

    function stopSimulation(id: string) {
        if (uploadTimers.current[id]) {
            clearInterval(uploadTimers.current[id]);
            delete uploadTimers.current[id];
        }
    }

    function enqueueUploads(files: FileList | File[]) {
        const arr = Array.from(files);
        if (!arr.length) return;
        const newUploads: UploadFile[] = arr.map(f => ({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: f.name,
            size: f.size || 1024 * 1024, // fallback for demo
            uploaded: 0,
            status: 'pending' as UploadStatus,
        }));
        setUploads(prev => [...prev, ...newUploads]);
        setUploadCardOpen(true);
        // Start uploading all immediately (simulate)
        newUploads.forEach(u => {
            setUploads(prev => prev.map(x => x.id === u.id ? { ...x, status: 'uploading' as UploadStatus } : x));
            setTimeout(() => startSimulation(u.id), 50);
        });
    }

    function pauseUpload(id: string) {
        stopSimulation(id);
        setUploads(prev => prev.map(u => u.id === id && u.status === 'uploading' ? { ...u, status: 'paused' as UploadStatus } : u));
    }

    function resumeUpload(id: string) {
        setUploads(prev => prev.map(u => u.id === id && u.status === 'paused' ? { ...u, status: 'uploading' as UploadStatus } : u));
        startSimulation(id);
    }

    function cancelUpload(id: string) {
        stopSimulation(id);
        setUploads(prev => prev.filter(u => u.id !== id));
    }

    function retryUpload(id: string) {
        setUploads(prev => prev.map(u => u.id === id ? { ...u, status: 'uploading' as UploadStatus, uploaded: 0, error: undefined } : u));
        startSimulation(id);
    }

    function dismissUpload(id: string) {
        stopSimulation(id);
        setUploads(prev => prev.filter(u => u.id !== id));
    }

    function dismissAllCompleted() {
        setUploads(prev => prev.filter(u => u.status !== 'completed'));
    }

    function closeUploadCard() {
        setUploadCardOpen(false);
    }

    function toggleUploadCard() {
        setUploadCardOpen(o => !o);
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
        networkRequests,
        networkDrawerOpen,
        toggleNetworkDrawer,
        clearNetworkRequests,
        logNetworkRequest,
        uploads,
        uploadCardOpen,
        enqueueUploads,
        pauseUpload,
        resumeUpload,
        cancelUpload,
        retryUpload,
        dismissUpload,
        dismissAllCompleted,
        closeUploadCard,
        toggleUploadCard,
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
