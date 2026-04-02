import React, { createContext, useCallback, useContext, useEffect, useRef, useState, useMemo } from 'react';
import { StorageItem, BreadcrumbEntry, SortColumn, SortDirection, SidePanelTab, ModalState, ViewMode, NetworkRequest, UploadFile, UploadStatus } from '../models/StorageItem';
import { ITEMS_BY_ID, DELETED_CONTAINERS, RECYCLED_ITEMS_BY_CONTAINER_ID } from '../data/dummyData';
import { createStorageExplorerApi, StorageExplorerApi, WebviewAuthProvider } from '../api';

// Window state injected by StorageExplorerPanel._buildHtml
declare global {
    interface Window {
        __STORAGE_EXPLORER_STATE__?: {
            appName: string;
            tenantDomain: string;
            containerTypeId: string;
            registrationId: string;
            initialToken?: string;
        };
    }
}

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
    api: StorageExplorerApi;
    isLoading: boolean;
    refresh: () => void;
    createContainer: (name: string, description?: string) => Promise<void>;
    renameContainer: (containerId: string, newName: string) => Promise<void>;
    deleteContainer: (containerId: string) => Promise<void>;
    restoreContainer: (containerId: string) => Promise<void>;
    permanentlyDeleteContainer: (containerId: string) => Promise<void>;
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
    // Panel state injected by the extension host (immutable for this session)
    const panelState = window.__STORAGE_EXPLORER_STATE__ ?? {
        appName: 'Storage Explorer',
        tenantDomain: '',
        containerTypeId: '',
        registrationId: '',
    };

    // ── API instances (created once per session) ──────────────────────────────
    const authProviderRef = useRef<WebviewAuthProvider | undefined>(undefined);
    const apiRef = useRef<StorageExplorerApi | undefined>(undefined);

    // Stable network logger — setNetworkRequests is stable across renders
    const handleNetworkRequest = useCallback((req: NetworkRequest) => {
        setNetworkRequests(prev => [...prev, req]);
    }, []);

    if (!authProviderRef.current) {
        authProviderRef.current = new WebviewAuthProvider();
    }
    if (!apiRef.current) {
        apiRef.current = createStorageExplorerApi(authProviderRef.current, handleNetworkRequest);
    }

    const [path, setPath] = useState<BreadcrumbEntry[]>([
        { label: panelState.appName, id: null }
    ]);
    const [rootItems, setRootItems] = useState<StorageItem[]>([]);
    const [deletedContainers, setDeletedContainers] = useState<StorageItem[]>([]);
    const [selectedItem, setSelectedItem] = useState<StorageItem | null>(null);
    const [sortColumn, setSortColumnState] = useState<SortColumn>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [sidePanelOpen, setSidePanelOpen] = useState(true);
    const [sidePanelTab, setSidePanelTabState] = useState<SidePanelTab>('permissions');
    const [modal, setModal] = useState<ModalState | null>(null);
    const [retentionOverrides, setRetentionOverridesState] = useState<Record<string, number | null>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [networkRequests, setNetworkRequests] = useState<NetworkRequest[]>([]);
    const [networkDrawerOpen, setNetworkDrawerOpen] = useState(false);
    // ── upload state ──
    const [uploads, setUploads] = useState<UploadFile[]>([]);
    const [uploadCardOpen, setUploadCardOpen] = useState(false);
    // Map of upload id → interval handle for simulation
    const uploadTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

    const lastId = path[path.length - 1]?.id ?? null;

    // viewMode must be declared before loadCurrentView and refresh so their
    // useCallback/useMemo dep arrays can reference it without hitting TDZ.
    const viewMode = useMemo((): ViewMode => {
        if (lastId === '__deleted_containers') return { kind: 'deleted-containers' };
        if (lastId === '__recyclebin__') {
            const containerId = path[path.length - 2]?.id;
            if (containerId) return { kind: 'container-recycle-bin', containerId };
        }
        return { kind: 'normal' };
    }, [lastId, path]);

    // ── Refresh / data loading ────────────────────────────────────────────────
    const loadCurrentView = useCallback((currentViewMode: ViewMode) => {
        const { containerTypeId } = panelState;
        setIsLoading(true);
        if (currentViewMode.kind === 'normal') {
            if (!containerTypeId) { setIsLoading(false); return; }
            apiRef.current!.containers.list(containerTypeId)
                .then(items => setRootItems(items))
                .catch(err => console.error('[StorageExplorer] Failed to load containers:', err))
                .finally(() => setIsLoading(false));
        } else if (currentViewMode.kind === 'deleted-containers') {
            if (!containerTypeId) { setIsLoading(false); return; }
            apiRef.current!.containers.listDeleted(containerTypeId)
                .then(items => setDeletedContainers(items))
                .catch(err => console.error('[StorageExplorer] Failed to load deleted containers:', err))
                .finally(() => setIsLoading(false));
        } else {
            // Inside a container/folder — will call drive.listChildren once implemented
            setIsLoading(false);
        }
    // panelState is stable (injected once at mount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Load whenever the view mode changes (includes initial mount)
    useEffect(() => {
        loadCurrentView(viewMode);
    // viewMode is a stable object from useMemo; using .kind ensures we re-fire on navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode.kind]);

    const refresh = useCallback(() => {
        loadCurrentView(viewMode);
    }, [loadCurrentView, viewMode]);

    const createContainer = useCallback(async (name: string, description?: string) => {
        const { containerTypeId } = panelState;
        await apiRef.current!.containers.create(containerTypeId, name, description);
        await loadCurrentView(viewMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadCurrentView, viewMode]);

    const renameContainer = useCallback(async (containerId: string, newName: string) => {
        await apiRef.current!.containers.rename(containerId, newName);
        await loadCurrentView(viewMode);
    }, [loadCurrentView, viewMode]);

    const deleteContainer = useCallback(async (containerId: string) => {
        await apiRef.current!.containers.delete(containerId);
        setSelectedItem(null);
        await loadCurrentView(viewMode);
    }, [loadCurrentView, viewMode]);

    const currentItems = useMemo(() => {
        if (viewMode.kind !== 'normal') return [];
        const raw = lastId === null ? rootItems : (ITEMS_BY_ID[lastId] ?? []);
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
    }, [lastId, viewMode, rootItems, sortColumn, sortDirection]);

    const currentRecycledItems = useMemo(() => {
        if (viewMode.kind === 'normal') return [];
        const raw = viewMode.kind === 'deleted-containers'
            ? deletedContainers
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
    }, [viewMode, deletedContainers, sortColumn, sortDirection]);

    const restoreContainer = useCallback(async (containerId: string) => {
        await apiRef.current!.containers.restore(containerId);
        setSelectedItem(null);
        await loadCurrentView(viewMode);
    }, [loadCurrentView, viewMode]);

    const permanentlyDeleteContainer = useCallback(async (containerId: string) => {
        await apiRef.current!.containers.permanentlyDelete(containerId);
        setSelectedItem(null);
        await loadCurrentView(viewMode);
    }, [loadCurrentView, viewMode]);

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
        appName: panelState.appName,
        tenantDomain: panelState.tenantDomain,
        api: apiRef.current!,
        isLoading,
        refresh,
        createContainer,
        renameContainer,
        deleteContainer,
        restoreContainer,
        permanentlyDeleteContainer,
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
