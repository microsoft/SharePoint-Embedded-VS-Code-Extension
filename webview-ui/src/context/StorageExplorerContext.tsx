import React, { createContext, useCallback, useContext, useEffect, useRef, useState, useMemo } from 'react';
import { StorageItem, BreadcrumbEntry, SortColumn, SortDirection, SidePanelTab, ModalState, ViewMode, NetworkRequest, UploadFile, UploadStatus } from '../models/StorageItem';
import { DELETED_CONTAINERS, RECYCLED_ITEMS_BY_CONTAINER_ID } from '../data/dummyData';
import { createStorageExplorerApi, StorageExplorerApi, WebviewAuthProvider } from '../api';
import { DriveGraphService } from '../api/services/DriveGraphService';
import { openUrl } from '../utils/openUrl';

/**
 * Maps a filename extension to the Office desktop URI scheme name.
 * Returns null for non-Office files.
 */
function officeDesktopScheme(fileName: string): string | null {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (['docx', 'doc', 'docm'].includes(ext)) return 'ms-word';
    if (['xlsx', 'xls', 'xlsm'].includes(ext)) return 'ms-excel';
    if (['pptx', 'ppt', 'pptm'].includes(ext)) return 'ms-powerpoint';
    return null;
}

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
    // ── drive item operations ──
    createFolder: (name: string) => Promise<void>;
    createFile: (name: string) => Promise<void>;
    renameItem: (item: StorageItem, newName: string) => Promise<void>;
    deleteItem: (item: StorageItem) => Promise<void>;
    restoreRecycledItem: (item: StorageItem) => Promise<void>;
    permanentlyDeleteItem: (item: StorageItem) => Promise<void>;
    previewItem: (item: StorageItem) => Promise<void>;
    downloadItem: (item: StorageItem) => Promise<void>;
    openInDesktopApp: (item: StorageItem) => Promise<void>;
    /** The driveId (= containerId) for the currently open container, or null at root */
    currentDriveId: string | null;
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
    // Map of folderId/containerId → children (populated as user navigates)
    const [folderItems, setFolderItems] = useState<Record<string, StorageItem[]>>({});
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
    // Per-upload refs — hold state that must outlive renders without triggering them.
    /** The actual File object, kept for retry/resume. */
    const uploadFiles = useRef<Map<string, File>>(new Map());
    /** driveId + parentId captured at enqueue time; survives user navigation. */
    const uploadContexts = useRef<Map<string, { driveId: string; parentId: string | null }>>(new Map());
    /** Next byte offset for resumable chunked uploads. */
    const uploadOffsets = useRef<Map<string, number>>(new Map());
    /** Pre-authenticated session URL for large-file uploads. */
    const uploadSessions = useRef<Map<string, string>>(new Map());
    /** Control signal for each in-progress upload loop. */
    const uploadStates = useRef<Map<string, 'running' | 'paused' | 'cancelled'>>(new Map());

    const lastId = path[path.length - 1]?.id ?? null;

    // driveId = the container id at path[1]; null when at root
    const currentDriveId = path.length >= 2 ? (path[1].id ?? null) : null;
    // parentId for creating items: the current folder itemId, or null if we're at container root
    const currentParentId = (path.length >= 2 && lastId !== currentDriveId) ? lastId : null;

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
            // Determine the current path state at call time by reading from path state
            // We receive viewMode but need the current lastId — capture it via closure
            // instead we'll re-read from path in a separate effect
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
            setIsLoading(false);
        }
    // panelState is stable (injected once at mount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Load drive items whenever we navigate into a container/folder
    const loadDriveItems = useCallback((driveId: string, itemId?: string) => {
        const key = itemId ?? driveId;
        setIsLoading(true);
        apiRef.current!.drive.listChildren(driveId, itemId)
            .then(items => setFolderItems(prev => ({ ...prev, [key]: items })))
            .catch(err => console.error('[StorageExplorer] Failed to load drive items:', err))
            .finally(() => setIsLoading(false));
    }, []);

    // Load whenever the view mode changes (includes initial mount)
    useEffect(() => {
        loadCurrentView(viewMode);
    // viewMode is a stable object from useMemo; using .kind ensures we re-fire on navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode.kind]);

    // Load drive children whenever we navigate into a container or subfolder
    useEffect(() => {
        if (viewMode.kind !== 'normal') return;
        if (lastId === null) return; // at root — handled by containers.list
        const driveId = path[1]?.id;
        if (!driveId) return;
        const itemId = lastId !== driveId ? lastId : undefined;
        loadDriveItems(driveId, itemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastId]);

    // Load container recycle bin items when navigating into one
    useEffect(() => {
        if (viewMode.kind !== 'container-recycle-bin') return;
        const { containerId } = viewMode;
        setIsLoading(true);
        apiRef.current!.drive.listRecycleBin(containerId)
            .then(items => setFolderItems(prev => ({ ...prev, [`recycle-${containerId}`]: items })))
            .catch(err => console.error('[StorageExplorer] Failed to load recycle bin:', err))
            .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode.kind === 'container-recycle-bin' ? (viewMode as any).containerId : null]);

    const refresh = useCallback(() => {
        if (viewMode.kind !== 'normal' || lastId === null) {
            loadCurrentView(viewMode);
            return;
        }
        const driveId = path[1]?.id;
        if (!driveId) { loadCurrentView(viewMode); return; }
        const itemId = lastId !== driveId ? lastId : undefined;
        loadDriveItems(driveId, itemId);
    }, [loadCurrentView, loadDriveItems, viewMode, lastId, path]);

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
        let raw: StorageItem[];
        if (lastId === null) {
            raw = rootItems;
        } else {
            // Use the container id as key when at container root, folder id otherwise
            const key = lastId;
            raw = folderItems[key] ?? [];
        }
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
    }, [lastId, viewMode, rootItems, folderItems, sortColumn, sortDirection]);

    const currentRecycledItems = useMemo(() => {
        if (viewMode.kind === 'normal') return [];
        const raw = viewMode.kind === 'deleted-containers'
            ? deletedContainers
            : (folderItems[`recycle-${viewMode.containerId}`] ?? []);
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
    }, [viewMode, deletedContainers, folderItems, sortColumn, sortDirection]);

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

    const restoreRecycledItem = useCallback(async (item: StorageItem) => {
        if (viewMode.kind !== 'container-recycle-bin') return;
        const { containerId } = viewMode;
        await apiRef.current!.drive.restoreFromRecycleBin(containerId, item.id);
        setFolderItems(prev => ({
            ...prev,
            [`recycle-${containerId}`]: (prev[`recycle-${containerId}`] ?? []).filter(i => i.id !== item.id),
        }));
        setSelectedItem(null);
    }, [viewMode]);

    const permanentlyDeleteItem = useCallback(async (item: StorageItem) => {
        if (viewMode.kind !== 'container-recycle-bin') return;
        const { containerId } = viewMode;
        await apiRef.current!.drive.permanentlyDelete(containerId, item.id);
        setFolderItems(prev => ({
            ...prev,
            [`recycle-${containerId}`]: (prev[`recycle-${containerId}`] ?? []).filter(i => i.id !== item.id),
        }));
        setSelectedItem(null);
    }, [viewMode]);

    // ── Drive item CRUD ───────────────────────────────────────────────────────

    const createFolder = useCallback(async (name: string) => {
        if (!currentDriveId) return;
        const item = await apiRef.current!.drive.createFolder(currentDriveId, currentParentId, name);
        const key = currentParentId ?? currentDriveId;
        setFolderItems(prev => ({ ...prev, [key]: [...(prev[key] ?? []), item] }));
    }, [currentDriveId, currentParentId]);

    const createFile = useCallback(async (name: string) => {
        if (!currentDriveId) return;
        const item = await apiRef.current!.drive.createFile(currentDriveId, currentParentId, name);
        const key = currentParentId ?? currentDriveId;
        setFolderItems(prev => ({ ...prev, [key]: [...(prev[key] ?? []), item] }));
    }, [currentDriveId, currentParentId]);

    const renameItem = useCallback(async (item: StorageItem, newName: string) => {
        if (!currentDriveId) return;
        await apiRef.current!.drive.rename(currentDriveId, item.id, newName);
        const key = currentParentId ?? currentDriveId;
        setFolderItems(prev => ({
            ...prev,
            [key]: (prev[key] ?? []).map(i => i.id === item.id ? { ...i, name: newName } : i),
        }));
        setSelectedItem(prev => prev?.id === item.id ? { ...prev, name: newName } : prev);
    }, [currentDriveId, currentParentId]);

    const deleteItem = useCallback(async (item: StorageItem) => {
        if (!currentDriveId) return;
        await apiRef.current!.drive.delete(currentDriveId, item.id);
        const key = currentParentId ?? currentDriveId;
        setFolderItems(prev => ({
            ...prev,
            [key]: (prev[key] ?? []).filter(i => i.id !== item.id),
        }));
        setSelectedItem(null);
    }, [currentDriveId, currentParentId]);

    const previewItem = useCallback(async (item: StorageItem) => {
        if (!currentDriveId) return;
        const url = await apiRef.current!.drive.getPreviewUrl(currentDriveId, item.id);
        openUrl(url);
    }, [currentDriveId]);

    const downloadItem = useCallback(async (item: StorageItem) => {
        if (!currentDriveId) return;
        // Use cached downloadUrl if present; otherwise fetch on demand.
        // SPE does not always return @microsoft.graph.downloadUrl in listing
        // responses (notably absent for Office files), so we fetch it lazily.
        const url = item.downloadUrl ?? await apiRef.current!.drive.getDownloadUrl(currentDriveId, item.id);
        openUrl(url);
    }, [currentDriveId]);

    const openInDesktopApp = useCallback(async (item: StorageItem) => {
        if (!currentDriveId) return;
        const scheme = officeDesktopScheme(item.name);
        if (!scheme) return;
        // The item's webUrl points to Office Online, not the file itself.
        // The actual file URL is: parentFolder.webUrl + '/' + fileName
        const parentWebUrl = await apiRef.current!.drive.getItemWebUrl(currentDriveId, currentParentId ?? undefined);
        const fileUrl = `${parentWebUrl}/${encodeURIComponent(item.name)}`;
        openUrl(`${scheme}:ofe|u|${fileUrl}`);
    }, [currentDriveId, currentParentId]);

    function navigate(item: StorageItem) {
        if (item.kind === 'file') return;
        if (viewMode.kind !== 'normal') return;
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

    // ── Upload helpers ────────────────────────────────────────────────────────

    function addToFolderCache(driveId: string, parentId: string | null, item: StorageItem) {
        const key = parentId ?? driveId;
        setFolderItems(prev => ({
            ...prev,
            [key]: [...(prev[key] ?? []).filter(i => i.name !== item.name), item],
        }));
    }

    function cleanupUploadRefs(id: string) {
        uploadFiles.current.delete(id);
        uploadContexts.current.delete(id);
        uploadOffsets.current.delete(id);
        uploadSessions.current.delete(id);
        uploadStates.current.delete(id);
    }

    async function runUpload(id: string) {
        const file = uploadFiles.current.get(id);
        const ctx = uploadContexts.current.get(id);
        if (!file || !ctx) return;
        const { driveId, parentId } = ctx;

        uploadStates.current.set(id, 'running');
        setUploads(prev => prev.map(u => u.id === id ? { ...u, status: 'uploading' as UploadStatus, error: undefined } : u));

        try {
            if (file.size <= DriveGraphService.SMALL_FILE_THRESHOLD) {
                // ── Simple single-PUT upload ─────────────────────────────────
                const item = await apiRef.current!.drive.uploadSmall(driveId, parentId, file);
                if (uploadStates.current.get(id) === 'cancelled') return;
                addToFolderCache(driveId, parentId, item);
                setUploads(prev => prev.map(u => u.id === id ? { ...u, uploaded: file.size, status: 'completed' as UploadStatus } : u));
                cleanupUploadRefs(id);
            } else {
                // ── Session-based chunked upload ─────────────────────────────
                let sessionUrl = uploadSessions.current.get(id);
                if (!sessionUrl) {
                    sessionUrl = await apiRef.current!.drive.createUploadSession(driveId, parentId, file.name);
                    uploadSessions.current.set(id, sessionUrl);
                }
                if (uploadStates.current.get(id) === 'cancelled') return;

                let offset = uploadOffsets.current.get(id) ?? 0;
                while (offset < file.size) {
                    const state = uploadStates.current.get(id);
                    if (state === 'cancelled') return;
                    if (state === 'paused') return; // resumeUpload() will call runUpload() again

                    const result = await apiRef.current!.drive.uploadChunk(sessionUrl, file, offset);
                    offset = result.nextOffset;
                    uploadOffsets.current.set(id, offset);
                    setUploads(prev => prev.map(u => u.id === id ? { ...u, uploaded: Math.min(offset, file.size) } : u));

                    if (result.done) {
                        if (result.item) addToFolderCache(driveId, parentId, result.item);
                        setUploads(prev => prev.map(u => u.id === id ? { ...u, uploaded: file.size, status: 'completed' as UploadStatus } : u));
                        cleanupUploadRefs(id);
                        return;
                    }
                }
            }
        } catch (err: any) {
            if (uploadStates.current.get(id) === 'cancelled') return;
            setUploads(prev => prev.map(u => u.id === id ? {
                ...u, status: 'failed' as UploadStatus,
                error: err?.message ?? 'Upload failed.',
            } : u));
        }
    }

    function enqueueUploads(files: FileList | File[]) {
        if (!currentDriveId) return;
        const arr = Array.from(files);
        if (!arr.length) return;
        const driveId = currentDriveId;
        const parentId = currentParentId;
        const newUploads: UploadFile[] = arr.map(f => ({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: f.name,
            size: f.size,
            uploaded: 0,
            status: 'pending' as UploadStatus,
        }));
        newUploads.forEach((u, i) => {
            uploadFiles.current.set(u.id, arr[i]);
            uploadContexts.current.set(u.id, { driveId, parentId });
        });
        setUploads(prev => [...prev, ...newUploads]);
        setUploadCardOpen(true);
        newUploads.forEach(u => void runUpload(u.id));
    }

    function pauseUpload(id: string) {
        uploadStates.current.set(id, 'paused');
        setUploads(prev => prev.map(u => u.id === id && u.status === 'uploading' ? { ...u, status: 'paused' as UploadStatus } : u));
    }

    function resumeUpload(id: string) {
        setUploads(prev => prev.map(u => u.id === id && u.status === 'paused' ? { ...u, status: 'uploading' as UploadStatus } : u));
        void runUpload(id);
    }

    function cancelUpload(id: string) {
        uploadStates.current.set(id, 'cancelled');
        const sessionUrl = uploadSessions.current.get(id);
        if (sessionUrl) void apiRef.current!.drive.cancelUploadSession(sessionUrl);
        cleanupUploadRefs(id);
        setUploads(prev => prev.filter(u => u.id !== id));
    }

    function retryUpload(id: string) {
        // Cancel any existing session and restart from byte 0
        const sessionUrl = uploadSessions.current.get(id);
        if (sessionUrl) {
            void apiRef.current!.drive.cancelUploadSession(sessionUrl);
            uploadSessions.current.delete(id);
        }
        uploadOffsets.current.delete(id);
        setUploads(prev => prev.map(u => u.id === id ? { ...u, uploaded: 0, error: undefined } : u));
        void runUpload(id);
    }

    function dismissUpload(id: string) {
        uploadStates.current.set(id, 'cancelled');
        const sessionUrl = uploadSessions.current.get(id);
        if (sessionUrl) void apiRef.current!.drive.cancelUploadSession(sessionUrl);
        cleanupUploadRefs(id);
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
        restoreRecycledItem,
        permanentlyDeleteItem,
        createFolder,
        createFile,
        renameItem,
        deleteItem,
        previewItem,
        downloadItem,
        openInDesktopApp,
        currentDriveId,
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
