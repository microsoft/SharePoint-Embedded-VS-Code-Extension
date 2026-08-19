import React, { createContext, useCallback, useContext, useEffect, useRef, useState, useMemo } from 'react';
import { StorageItem, BreadcrumbEntry, SortColumn, SortDirection, SidePanelTab, ModalState, ViewMode, NetworkRequest, UploadFile, UploadStatus } from '../models/StorageItem';
import { DELETED_CONTAINERS, RECYCLED_ITEMS_BY_CONTAINER_ID } from '../data/dummyData';
import { createStorageExplorerApi, onHostNetworkRequest, StorageExplorerApi } from '../api';
import type { CollectionScope, MissingExtensionPermissionsCode, StorageExplorerReadiness } from '../api/protocol';

/** Stable key for a collection scope, so continuations are tracked per view. */
function scopeKey(scope: CollectionScope): string {
    return `${scope.kind}|${scope.containerId ?? ''}|${scope.itemId ?? ''}`;
}
import { DriveGraphService } from '../api/services/DriveGraphService';
import { openUrl } from '../utils/openUrl';
import { onExtensionMessage, postToExtension } from '../utils/vsbridge';

/** See `MissingExtensionPermissionsCode` in the host protocol — kept in sync by the annotation. */
const MISSING_EXTENSION_PERMISSIONS_CODE: MissingExtensionPermissionsCode = 'missingExtensionAppPermissions';

/** Why the current view has no data. Distinguishes "nothing here" from "the load failed". */
export interface LoadFailure {
    /** `permissions` renders a call to action; `generic` renders a plain failure state. */
    kind: 'permissions' | 'generic';
    message: string;
}

/** Classify a rejected load so the list can render the right failure state. */
function toLoadFailure(error: unknown): LoadFailure {
    const err = error as { message?: string; code?: string } | null | undefined;
    const message = err?.message || 'The request could not be completed.';
    return err?.code === MISSING_EXTENSION_PERMISSIONS_CODE
        ? { kind: 'permissions', message }
        : { kind: 'generic', message };
}

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

const SIZE_UNIT_BYTES: Record<string, number> = {
    B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4,
};

/**
 * Numeric size (in bytes) for an item, for sorting. Prefers the raw `sizeBytes`;
 * falls back to parsing the formatted `size` string (e.g. "1.2 MB") so items
 * that only carry a display string still sort by real magnitude.
 */
function sizeToBytes(item: StorageItem): number {
    if (typeof item.sizeBytes === 'number') return item.sizeBytes;
    const m = /^([\d.]+)\s*(B|KB|MB|GB|TB)$/i.exec((item.size ?? '').trim());
    if (!m) return 0;
    return parseFloat(m[1]) * (SIZE_UNIT_BYTES[m[2].toUpperCase()] ?? 1);
}

// Window state injected by StorageExplorerPanel._buildHtml
declare global {
    interface Window {
        __STORAGE_EXPLORER_STATE__?: {
            appName: string;
            tenantDomain: string;
            containerTypeId: string;
            registrationId: string;
            readiness?: StorageExplorerReadiness;
            requiredScopes?: string[];
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
    filterText: string;
    setFilterText: (text: string) => void;
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
    selectedIds: Set<string>;
    toggleSelected: (id: string) => void;
    selectAllCurrent: () => void;
    clearSelected: () => void;
    deleteSelected: () => Promise<void>;
    deleteProgress: { current: number; total: number } | null;
    cancelDelete: () => void;
    setSort: (col: SortColumn) => void;
    setSidePanelTab: (tab: SidePanelTab) => void;
    toggleSidePanel: () => void;
    modal: ModalState | null;
    openModal: (state: ModalState) => void;
    closeModal: () => void;
    retentionOverrides: Record<string, number | null>;
    setRetentionOverride: (containerId: string, days: number | null) => void;
    api: StorageExplorerApi;
    /**
     * Whether this container type can serve requests at all. Anything but `ready` renders the
     * onboarding surface and suppresses every collection request.
     */
    readiness: StorageExplorerReadiness;
    /** Scope names the container type still needs granted, when readiness blocks on them. */
    requiredScopes: string[];
    /** True when the server said another page exists for the view on screen. */
    canLoadMore: boolean;
    /** Fetch exactly one more page for the current view. No-op when there is nothing more. */
    loadMore: () => Promise<void>;
    /** True while a Load more request is in flight. */
    isLoadingMore: boolean;
    /** Set when the last Load more failed, so the button can offer a retry. */
    loadMoreError: string | null;
    isLoading: boolean;
    loadProgress: number;
    /** Set when the current view failed to load; null when the view simply has no items. */
    loadError: LoadFailure | null;
    /** Ask the host to raise the extension-app permission prompt for this container type. */
    grantPermissions: () => void;
    /** True while that prompt is open, so the button can show it is waiting on the user. */
    isGrantingPermissions: boolean;
    refresh: () => void;
    createContainer: (name: string, description?: string) => Promise<void>;
    activateContainer: (containerId: string) => Promise<void>;
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
    retryAllFailed: () => void;
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
    const readiness: StorageExplorerReadiness = panelState.readiness ?? 'ready';
    const requiredScopes = panelState.requiredScopes ?? [];
    /**
     * A container type that is not ready cannot serve container or file operations, so the
     * webview must not issue them: the onboarding surface names the next action instead, and
     * a blocked panel costs zero Graph requests.
     */
    const isReady = readiness === 'ready';

    // ── API instances (created once per session) ──────────────────────────────
    // No credentials live here: every service forwards a named operation to the
    // extension host, which holds the delegated Graph token.
    const apiRef = useRef<StorageExplorerApi | undefined>(undefined);

    // Stable network logger — setNetworkRequests is stable across renders
    const handleNetworkRequest = useCallback((req: NetworkRequest) => {
        setNetworkRequests(prev => [...prev, req]);
    }, []);

    if (!apiRef.current) {
        apiRef.current = createStorageExplorerApi(handleNetworkRequest);
    }

    // Graph traffic is issued by the extension host, so its network log entries
    // arrive over postMessage rather than through a webview middleware.
    useEffect(() => onHostNetworkRequest(handleNetworkRequest), [handleNetworkRequest]);

    const [path, setPath] = useState<BreadcrumbEntry[]>([
        { label: panelState.appName, id: null }
    ]);
    const [rootItems, setRootItems] = useState<StorageItem[]>([]);
    // Containers returned by create remain in this session-only overlay until
    // authoritative enumeration catches up and returns the same container ID.
    const [locallyCreatedContainers, setLocallyCreatedContainers] = useState<Map<string, StorageItem>>(
        () => new Map(),
    );
    // Successful deletes stay hidden while Graph's eventually consistent collection still
    // returns them. Once an authoritative list omits an ID, its tombstone is no longer needed.
    const deletedContainerIdsRef = useRef<Set<string>>(new Set());
    const [deletedContainers, setDeletedContainers] = useState<StorageItem[]>([]);
    // Map of folderId/containerId → children (populated as user navigates)
    const [folderItems, setFolderItems] = useState<Record<string, StorageItem[]>>({});
    const [selectedItem, setSelectedItem] = useState<StorageItem | null>(null);
    // Client-side name filter applied to the currently-listed items (containers / files / recycled).
    const [filterText, setFilterText] = useState('');
    // Number of drive items loaded so far during a multi-page listing (for the loading indicator).
    const [loadProgress, setLoadProgress] = useState(0);
    // Multi-selection (checkbox column + "select all"). Independent of `selectedItem`, which is
    // the single row whose details show in the side panel.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    // Progress of an in-flight bulk delete (null when not deleting).
    const [deleteProgress, setDeleteProgress] = useState<{ current: number; total: number } | null>(null);
    const deleteCancelRef = useRef(false);
    // Date Modified descending is the fixed default for every list: the question a user opens
    // Storage Explorer to answer is "what changed recently", and a newly created container or
    // freshly uploaded file must be visible without hunting. It is not toggleable — see setSort.
    const [sortColumn, setSortColumnState] = useState<SortColumn>('modified');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    // Opaque continuation handle per view, keyed by scope. Absent/undefined means the server
    // returned the final page. These are host-minted ids, never Graph nextLinks.
    const [continuations, setContinuations] = useState<Record<string, string | undefined>>({});
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
    const [sidePanelOpen, setSidePanelOpen] = useState(true);
    const [sidePanelTab, setSidePanelTabState] = useState<SidePanelTab>('permissions');
    const [modal, setModal] = useState<ModalState | null>(null);
    const [retentionOverrides, setRetentionOverridesState] = useState<Record<string, number | null>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<LoadFailure | null>(null);
    // True while the host is showing the extension-app grant prompt on our behalf.
    const [isGrantingPermissions, setIsGrantingPermissions] = useState(false);
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

    /**
     * Guards the shared listing state (`isLoading`, `loadProgress`, `loadError`).
     *
     * All four load paths write to the same three pieces of state, and nothing cancels an
     * in-flight RPC when the user navigates. Without a guard, a rejection from a listing the
     * user has already left surfaces as an error on the view they are looking at now — and a
     * late success clears an error that is still valid. Each load takes a token and only
     * writes back while it is still the newest one.
     */
    const loadSeqRef = useRef(0);

    /** Begin a load: reset the shared state and return a "still the current load" predicate. */
    const beginLoad = useCallback((): (() => boolean) => {
        const token = ++loadSeqRef.current;
        setIsLoading(true);
        setLoadProgress(0);
        setLoadError(null);
        return () => loadSeqRef.current === token;
    }, []);

    /** Invalidate any in-flight load without starting one (used when a view needs no fetch). */
    const cancelLoad = useCallback(() => {
        loadSeqRef.current++;
        setIsLoading(false);
        setLoadError(null);
    }, []);

    const loadCurrentView = useCallback((currentViewMode: ViewMode) => {
        const { containerTypeId } = panelState;
        const isCurrent = beginLoad();
        if (!isReady) { setIsLoading(false); return; }
        if (currentViewMode.kind === 'normal') {
            if (!containerTypeId) { setIsLoading(false); return; }
            const key = scopeKey({ kind: 'containers' });
            apiRef.current!.containers.list()
                .then(page => {
                    if (!isCurrent()) { return; }
                    const items = page.items;
                    const authoritativeIds = new Set(items.map(item => item.id));
                    setRootItems(items.filter(item => !deletedContainerIdsRef.current.has(item.id)));
                    setContinuations(prev => ({ ...prev, [key]: page.continuation }));
                    for (const id of deletedContainerIdsRef.current) {
                        if (!authoritativeIds.has(id)) {
                            deletedContainerIdsRef.current.delete(id);
                        }
                    }
                    // Only IDs the *loaded* pages actually returned are reconciled. A container
                    // still sitting on an unfetched page has not been superseded, so dropping it
                    // from the overlay here would make it vanish from the user's own session.
                    setLocallyCreatedContainers(prev => {
                        const reconciledIds = [...prev.keys()].filter(id => authoritativeIds.has(id));
                        if (reconciledIds.length === 0) { return prev; }
                        const next = new Map(prev);
                        for (const id of reconciledIds) { next.delete(id); }
                        return next;
                    });
                })
                .catch(err => {
                    console.error('[StorageExplorer] Failed to load containers:', err);
                    if (!isCurrent()) { return; }
                    setRootItems([]);
                    setContinuations(prev => ({ ...prev, [key]: undefined }));
                    setLoadError(toLoadFailure(err));
                })
                .finally(() => { if (isCurrent()) { setIsLoading(false); } });
        } else if (currentViewMode.kind === 'deleted-containers') {
            if (!containerTypeId) { setIsLoading(false); return; }
            const key = scopeKey({ kind: 'deletedContainers' });
            apiRef.current!.containers.listDeleted()
                .then(page => {
                    if (!isCurrent()) { return; }
                    setDeletedContainers(page.items);
                    setContinuations(prev => ({ ...prev, [key]: page.continuation }));
                })
                .catch(err => {
                    console.error('[StorageExplorer] Failed to load deleted containers:', err);
                    if (!isCurrent()) { return; }
                    setDeletedContainers([]);
                    setContinuations(prev => ({ ...prev, [key]: undefined }));
                    setLoadError(toLoadFailure(err));
                })
                .finally(() => { if (isCurrent()) { setIsLoading(false); } });
        } else {
            setIsLoading(false);
        }
    // panelState is stable (injected once at mount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [beginLoad, isReady]);

    /**
     * Load the first page of drive items whenever we navigate into a container/folder.
     *
     * `silent` re-lists a folder in the background (after an upload) without touching the
     * shared loading/error state — that folder may not be the one on screen any more.
     */
    const loadDriveItems = useCallback((driveId: string, itemId?: string, opts?: { silent?: boolean }) => {
        const key = itemId ?? driveId;
        const silent = opts?.silent === true;
        const isCurrent = silent ? () => false : beginLoad();
        if (!isReady) { setIsLoading(false); return; }
        const continuationKey = scopeKey({ kind: 'driveChildren', containerId: driveId, itemId });
        apiRef.current!.drive.listChildren(driveId, itemId)
            .then(page => {
                setFolderItems(prev => ({ ...prev, [key]: page.items }));
                setContinuations(prev => ({ ...prev, [continuationKey]: page.continuation }));
            })
            .catch(err => {
                console.error('[StorageExplorer] Failed to load drive items:', err);
                setFolderItems(prev => ({ ...prev, [key]: [] }));
                setContinuations(prev => ({ ...prev, [continuationKey]: undefined }));
                if (isCurrent()) { setLoadError(toLoadFailure(err)); }
            })
            .finally(() => { if (isCurrent()) { setIsLoading(false); } });
    }, [beginLoad, isReady]);

    // Load whenever the view mode changes (includes initial mount)
    useEffect(() => {
        loadCurrentView(viewMode);
    // viewMode is a stable object from useMemo; using .kind ensures we re-fire on navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode.kind]);

    /**
     * The previous `lastId`, so we can tell "navigated back out of a folder" from "mounted at
     * the root". Both see `lastId === null`, but only the former should cancel a load — on
     * mount the root listing started by the `viewMode.kind` effect is still in flight, and
     * cancelling it would discard its result (including a legitimate error).
     */
    const prevLastIdRef = useRef<string | null>(null);

    // Load drive children whenever we navigate into a container or subfolder
    useEffect(() => {
        if (viewMode.kind !== 'normal') return;
        const cameFromFolder = prevLastIdRef.current !== null;
        prevLastIdRef.current = lastId;
        if (lastId === null) {
            // Back at the root list, which is already cached, so no load runs here. Drop any
            // error left behind by the folder we came from — it does not describe this view.
            if (cameFromFolder) { cancelLoad(); }
            return;
        }
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
        const isCurrent = beginLoad();
        if (!isReady) { setIsLoading(false); return; }
        const continuationKey = scopeKey({ kind: 'recycleBin', containerId });
        apiRef.current!.drive.listRecycleBin(containerId)
            .then(page => {
                setFolderItems(prev => ({ ...prev, [`recycle-${containerId}`]: page.items }));
                setContinuations(prev => ({ ...prev, [continuationKey]: page.continuation }));
            })
            .catch(err => {
                console.error('[StorageExplorer] Failed to load recycle bin:', err);
                setFolderItems(prev => ({ ...prev, [`recycle-${containerId}`]: [] }));
                setContinuations(prev => ({ ...prev, [continuationKey]: undefined }));
                if (isCurrent()) { setLoadError(toLoadFailure(err)); }
            })
            .finally(() => { if (isCurrent()) { setIsLoading(false); } });
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

    /**
     * Ask the host to raise the extension-app grant prompt.
     *
     * This is *not* a retry: re-running the denied call to make the host re-diagnose it
     * would do nothing visible whenever the automatic prompt is still open, and would raise
     * no prompt at all if the retry happened to fail some other way. The host owns the
     * consent dialog and the grant; the webview only asks for it and waits for the verdict.
     */
    const grantPermissions = useCallback(() => {
        setIsGrantingPermissions(true);
        postToExtension({ command: 'grantPermissions' });
    }, []);

    // Sent for every prompt — the automatic one raised by a denied call as well as the one
    // behind the button — so the button always stops spinning, granted or not.
    useEffect(() => onExtensionMessage('permissionsGrantResult', message => {
        setIsGrantingPermissions(false);
        if (message.granted) { refresh(); }
    }), [refresh]);

    const updateContainerInCurrentSession = useCallback((
        containerId: string,
        updates: Partial<StorageItem>,
    ) => {
        setLocallyCreatedContainers(prev => {
            const item = prev.get(containerId);
            if (!item) { return prev; }
            const next = new Map(prev);
            next.set(containerId, { ...item, ...updates });
            return next;
        });
        setRootItems(prev => prev.map(item =>
            item.id === containerId ? { ...item, ...updates } : item
        ));
        setSelectedItem(prev =>
            prev?.id === containerId ? { ...prev, ...updates } : prev
        );
    }, []);

    const removeContainerFromCurrentSession = useCallback((containerId: string) => {
        deletedContainerIdsRef.current.add(containerId);
        setLocallyCreatedContainers(prev => {
            if (!prev.has(containerId)) { return prev; }
            const next = new Map(prev);
            next.delete(containerId);
            return next;
        });
        setRootItems(prev => prev.filter(item => item.id !== containerId));
        setSelectedItem(prev => prev?.id === containerId ? null : prev);
        setSelectedIds(prev => {
            if (!prev.has(containerId)) { return prev; }
            const next = new Set(prev);
            next.delete(containerId);
            return next;
        });
    }, []);

    const createContainer = useCallback(async (name: string, description?: string) => {
        // containerTypeId is injected host-side; the webview cannot repoint it.
        const created = await apiRef.current!.containers.create(name, description);
        setLocallyCreatedContainers(prev => {
            const next = new Map(prev);
            next.set(created.id, created);
            return next;
        });
        void loadCurrentView(viewMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadCurrentView, viewMode]);

    const activateContainer = useCallback(async (containerId: string) => {
        await apiRef.current!.containers.activate(containerId);
        updateContainerInCurrentSession(containerId, { status: 'active' });
        void loadCurrentView(viewMode);
    }, [loadCurrentView, updateContainerInCurrentSession, viewMode]);

    const renameContainer = useCallback(async (containerId: string, newName: string) => {
        await apiRef.current!.containers.rename(containerId, newName);
        updateContainerInCurrentSession(containerId, { name: newName });
        void loadCurrentView(viewMode);
    }, [loadCurrentView, updateContainerInCurrentSession, viewMode]);

    const deleteContainer = useCallback(async (containerId: string) => {
        await apiRef.current!.containers.delete(containerId);
        removeContainerFromCurrentSession(containerId);
        void loadCurrentView(viewMode);
    }, [loadCurrentView, removeContainerFromCurrentSession, viewMode]);

    const currentItems = useMemo(() => {
        if (viewMode.kind !== 'normal') return [];
        const isRoot = lastId === null;
        const authoritative: StorageItem[] = isRoot ? rootItems : (folderItems[lastId] ?? []);
        const authoritativeIds = new Set(authoritative.map(item => item.id));
        // Containers this session created that the loaded pages have not returned yet. They
        // are pinned rather than merged: with only one page loaded, an alphabetical or size
        // sort would routinely bury a container the user just made below rows they did not
        // ask about, which reads as "my container was not created".
        const pinned = isRoot
            ? [...locallyCreatedContainers.values()].filter(item => !authoritativeIds.has(item.id))
            : [];

        const kindOrder: Record<string, number> = { container: 0, folder: 1, file: 2 };
        const filter = filterText.trim().toLowerCase();
        // Sorting and filtering are deliberately local: they act on what is loaded and never
        // trigger a hidden page fetch, so the list can never claim to have searched the server.
        const matches = (item: StorageItem) => !filter || item.name.toLowerCase().includes(filter);

        const pinnedRows = pinned
            .filter(matches)
            .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

        const rows = authoritative.filter(matches).sort((a, b) => {
            // Containers and folders always sort before files
            const kindCmp = (kindOrder[a.kind] ?? 2) - (kindOrder[b.kind] ?? 2);
            if (kindCmp !== 0) return kindCmp;

            let cmp = 0;
            switch (sortColumn) {
                case 'name': cmp = a.name.localeCompare(b.name); break;
                case 'modified': cmp = a.modifiedAt.localeCompare(b.modifiedAt); break;
                case 'type': cmp = a.type.localeCompare(b.type); break;
                case 'size': cmp = sizeToBytes(a) - sizeToBytes(b); break;
            }
            return sortDirection === 'asc' ? cmp : -cmp;
        });

        return [...pinnedRows, ...rows];
    }, [lastId, viewMode, rootItems, locallyCreatedContainers, folderItems, sortColumn, sortDirection, filterText]);

    const currentRecycledItems = useMemo(() => {
        if (viewMode.kind === 'normal') return [];
        const raw = viewMode.kind === 'deleted-containers'
            ? deletedContainers
            : (folderItems[`recycle-${viewMode.containerId}`] ?? []);
        const filter = filterText.trim().toLowerCase();
        const filtered = filter ? raw.filter(i => i.name.toLowerCase().includes(filter)) : raw;
        return [...filtered].sort((a, b) => {
            let cmp = 0;
            switch (sortColumn) {
                case 'name': cmp = a.name.localeCompare(b.name); break;
                case 'modified': cmp = a.modifiedAt.localeCompare(b.modifiedAt); break;
                case 'type': cmp = a.type.localeCompare(b.type); break;
                case 'size': cmp = sizeToBytes(a) - sizeToBytes(b); break;
                default: break;
            }
            return sortDirection === 'asc' ? cmp : -cmp;
        });
    }, [viewMode, deletedContainers, folderItems, sortColumn, sortDirection, filterText]);

    // Clear the multi-selection whenever the view/folder changes.
    useEffect(() => {
        setSelectedIds(new Set());
    }, [lastId, viewMode.kind]);

    const restoreContainer = useCallback(async (containerId: string) => {
        await apiRef.current!.containers.restore(containerId);
        deletedContainerIdsRef.current.delete(containerId);
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
        setFilterText('');
    }

    function navigateToBreadcrumb(index: number) {
        setPath(prev => prev.slice(0, index + 1));
        setSelectedItem(null);
        setFilterText('');
    }

    function navigateToDeletedContainers() {
        setPath([path[0], { label: 'Deleted containers', id: '__deleted_containers' }]);
        setSelectedItem(null);
        setFilterText('');
    }

    function navigateToContainerRecycleBin(containerId: string, containerName: string) {
        setPath([path[0], { label: containerName, id: containerId }, { label: 'Recycle bin', id: '__recyclebin__' }]);
        setSelectedItem(null);
        setFilterText('');
    }

    /**
     * Fill in a container's single-item-only properties (notably `status`).
     *
     * Graph's container *collection* endpoint returns a subset of properties, so containers
     * coming from a list carry no `status` and status-gated actions such as "Activate" would
     * never appear. Both selection paths — clicking a row and ticking its checkbox — route
     * through here. The merges match on id, so a response that lands after the user has moved
     * on can only ever refresh the item it describes.
     */
    function enrichContainer(item: StorageItem | null | undefined) {
        if (item?.kind !== 'container' || item.status) { return; }
        apiRef.current?.containers.get(item.id).then(fresh => {
            if (!fresh) { return; }
            updateContainerInCurrentSession(fresh.id, fresh);
        }).catch(() => { /* keep list data; status-gated actions stay hidden */ });
    }

    function selectItem(item: StorageItem | null) {
        setSelectedItem(item);
        enrichContainer(item);
    }

    function toggleSelected(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            return next;
        });
        // Ticking a checkbox is a selection too — the action bar gates "Activate" on `status`.
        enrichContainer(currentItems.find(i => i.id === id));
    }

    function selectAllCurrent() {
        setSelectedIds(new Set(currentItems.map(i => i.id)));
        // Only enrich when select-all yields the single-selection the Activate button needs;
        // firing one request per row would be pathological on a large list.
        if (currentItems.length === 1) { enrichContainer(currentItems[0]); }
    }

    function clearSelected() {
        setSelectedIds(new Set());
    }

    async function deleteSelected() {
        const items = currentItems.filter(i => selectedIds.has(i.id));
        deleteCancelRef.current = false;
        setDeleteProgress({ current: 0, total: items.length });
        let done = 0;
        for (const it of items) {
            if (deleteCancelRef.current) {
                console.log(`[StorageExplorer] bulk delete cancelled after ${done} of ${items.length}`);
                break;
            }
            try {
                if (it.kind === 'container') {
                    await apiRef.current!.containers.delete(it.id);
                    removeContainerFromCurrentSession(it.id);
                } else if (currentDriveId) {
                    await apiRef.current!.drive.delete(currentDriveId, it.id);
                }
            } catch (err) {
                console.error('[StorageExplorer] bulk delete failed for', it.name, err);
            }
            done++;
            setDeleteProgress({ current: done, total: items.length });
        }
        deleteCancelRef.current = false;
        setDeleteProgress(null);
        clearSelected();
        setSelectedItem(null);
        refresh();
    }

    function cancelDelete() {
        deleteCancelRef.current = true;
    }

    function setSort(col: SortColumn) {
        // Date Modified is fixed at newest-first and never toggles: it is the ordering the
        // whole "did my change land?" workflow depends on, and a stray click that flipped it
        // to oldest-first silently hid exactly the rows the user was looking for.
        if (col === 'modified') {
            setSortColumnState('modified');
            setSortDirection('desc');
            return;
        }
        if (col === sortColumn) {
            setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortColumnState(col);
            setSortDirection('asc');
        }
    }

    /** The collection the user is looking at right now, or null when there is nothing to page. */
    const currentScope: CollectionScope | null = useMemo(() => {
        if (viewMode.kind === 'deleted-containers') { return { kind: 'deletedContainers' }; }
        if (viewMode.kind === 'container-recycle-bin') {
            return { kind: 'recycleBin', containerId: viewMode.containerId };
        }
        if (lastId === null) { return { kind: 'containers' }; }
        const driveId = path[1]?.id;
        if (!driveId) { return null; }
        return {
            kind: 'driveChildren',
            containerId: driveId,
            itemId: lastId !== driveId ? lastId : undefined,
        };
    }, [viewMode, lastId, path]);

    const currentContinuation = currentScope ? continuations[scopeKey(currentScope)] : undefined;
    const canLoadMore = !!currentContinuation;

    /**
     * Fetch exactly one more page for the view on screen.
     *
     * Only ever reached from the user's own "Load more" click, so a list never grows behind
     * their back. The continuation is redeemed once: on failure the host reinstates it, so
     * the button can offer a retry without skipping a page.
     */
    async function loadMore(): Promise<void> {
        if (!currentScope || !currentContinuation || isLoadingMore) { return; }
        const scope = currentScope;
        const key = scopeKey(scope);
        setIsLoadingMore(true);
        setLoadMoreError(null);
        try {
            const page = await apiRef.current!.collections.loadMore(currentContinuation, scope);
            // Append by id so a page that overlaps the previous one cannot duplicate a row,
            // and so rows already on screen keep their identity (and the user's selection).
            const append = (existing: StorageItem[]): StorageItem[] => {
                const seen = new Set(existing.map(item => item.id));
                return [...existing, ...page.items.filter(item => !seen.has(item.id))];
            };
            switch (scope.kind) {
                case 'containers':
                    setRootItems(prev => append(prev).filter(i => !deletedContainerIdsRef.current.has(i.id)));
                    setLocallyCreatedContainers(prev => {
                        const arrived = page.items.filter(item => prev.has(item.id));
                        if (arrived.length === 0) { return prev; }
                        const next = new Map(prev);
                        // The authoritative row wins; the overlay entry has done its job.
                        for (const item of arrived) { next.delete(item.id); }
                        return next;
                    });
                    break;
                case 'deletedContainers':
                    setDeletedContainers(prev => append(prev));
                    break;
                case 'driveChildren': {
                    const folderKey = scope.itemId ?? scope.containerId!;
                    setFolderItems(prev => ({ ...prev, [folderKey]: append(prev[folderKey] ?? []) }));
                    break;
                }
                case 'recycleBin':
                    setFolderItems(prev => ({
                        ...prev,
                        [`recycle-${scope.containerId}`]: append(prev[`recycle-${scope.containerId}`] ?? []),
                    }));
                    break;
            }
            setContinuations(prev => ({ ...prev, [key]: page.continuation }));
        } catch (err: any) {
            console.error('[StorageExplorer] Failed to load the next page:', err);
            setLoadMoreError(err?.message ?? 'Could not load more items.');
        } finally {
            setIsLoadingMore(false);
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

                    const result = await apiRef.current!.drive.uploadChunk(sessionUrl, file, offset, driveId);
                    offset = result.nextOffset;
                    uploadOffsets.current.set(id, offset);
                    setUploads(prev => prev.map(u => u.id === id ? { ...u, uploaded: Math.min(offset, file.size) } : u));

                    if (result.done) {
                        if (result.item) {
                            addToFolderCache(driveId, parentId, result.item);
                        } else {
                            // The upload committed but the follow-up metadata read failed.
                            // Re-list the folder so the new file still shows up. Silent: the
                            // user may have navigated elsewhere while the upload ran.
                            loadDriveItems(driveId, parentId ?? undefined, { silent: true });
                        }
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

    function retryAllFailed() {
        // Restart every failed upload from the beginning.
        for (const u of uploads.filter(u => u.status === 'failed')) {
            retryUpload(u.id);
        }
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
        readiness,
        requiredScopes,
        canLoadMore,
        loadMore,
        isLoadingMore,
        loadMoreError,
        isLoading,
        loadProgress,
        loadError,
        grantPermissions,
        isGrantingPermissions,
        refresh,
        createContainer,
        activateContainer,
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
        filterText,
        setFilterText,
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
        selectedIds,
        toggleSelected,
        selectAllCurrent,
        clearSelected,
        deleteSelected,
        deleteProgress,
        cancelDelete,
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
        retryAllFailed,
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
