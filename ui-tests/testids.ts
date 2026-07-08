/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canonical `data-testid` strings — the single source of truth shared between the webview
 * components (which hard-code these exact strings) and the Playwright specs (which import them).
 *
 * Keep this in sync with the `data-testid` attributes in `webview-ui/src/**`.
 * Naming: kebab-case, `<area>-<element>[-<key>]`. Dynamic ids are templates.
 */
export const TID = {
    // ── Modal (shared) ───────────────────────────────────────────────────────
    modal: 'modal',
    modalConfirm: 'modal-confirm',
    modalCancel: 'modal-cancel',
    newContainerNameInput: 'new-container-name-input',
    newItemNameInput: 'new-item-name-input',
    renameInput: 'rename-input',

    // ── ActionBar — container view ───────────────────────────────────────────
    actionNewContainer: 'action-new-container',
    actionDeletedContainers: 'action-deleted-containers',
    actionRenameContainer: 'action-rename-container',
    actionDeleteContainer: 'action-delete-container',

    // ── ActionBar — file/folder view ─────────────────────────────────────────
    actionNewDropdown: 'action-new-dropdown',
    actionNewWord: 'action-new-word',
    actionNewPowerpoint: 'action-new-powerpoint',
    actionNewExcel: 'action-new-excel',
    actionNewFolder: 'action-new-folder',
    actionNewFile: 'action-new-file',
    actionUpload: 'action-upload',
    actionUploadInput: 'action-upload-input',
    actionOpenDropdown: 'action-open-dropdown',
    actionOpenWeb: 'action-open-web',
    actionOpenDesktop: 'action-open-desktop',
    actionPreview: 'action-preview',
    actionRenameItem: 'action-rename-item',
    actionDeleteItem: 'action-delete-item',
    actionDownload: 'action-download',

    // ── NavBar ───────────────────────────────────────────────────────────────
    navTenantDomain: 'nav-tenant-domain',
    navRefresh: 'nav-refresh',
    navNetworkToggle: 'nav-network-toggle',
    navUploadsToggle: 'nav-uploads-toggle',
    navSidepanelToggle: 'nav-sidepanel-toggle',
    searchInput: 'search-input',
    searchClear: 'search-clear',
    fileListEmpty: 'filelist-empty',
    listLoading: 'list-loading',

    // ── Breadcrumb ───────────────────────────────────────────────────────────
    breadcrumb: 'breadcrumb',
    breadcrumbItem: (index: number) => `breadcrumb-item-${index}`,

    // ── FileList ─────────────────────────────────────────────────────────────
    fileRow: (name: string) => `file-row-${name}`,
    fileRowMenuBtn: 'file-row-menu',
    sortName: 'sort-name',
    sortModified: 'sort-modified',
    sortType: 'sort-type',
    sortSize: 'sort-size',

    // ── ContextMenu ──────────────────────────────────────────────────────────
    contextMenu: 'context-menu',
    contextMenuItem: (key: string) => `context-menu-item-${key}`,

    // ── RecycledList ─────────────────────────────────────────────────────────
    recycledRow: (name: string) => `recycled-row-${name}`,
    recycledRestore: 'recycled-restore',
    recycledPermanentDelete: 'recycled-permanent-delete',
    recycledContextMenu: 'recycled-context-menu',
    recycledContextMenuItem: (key: string) => `recycled-context-menu-item-${key}`,

    // ── UploadCard ───────────────────────────────────────────────────────────
    uploadCard: 'upload-card',
    uploadItem: (name: string) => `upload-item-${name}`,
    uploadPause: 'upload-pause',
    uploadResume: 'upload-resume',
    uploadCancel: 'upload-cancel',
    uploadRetry: 'upload-retry',

    // ── SidePanel (shell + tabs) ─────────────────────────────────────────────
    sidePanel: 'sidepanel',
    sidePanelClose: 'sidepanel-close',
    sidePanelTab: (tab: string) => `sidepanel-tab-${tab}`,

    // ── PermissionsPanel (container + file share the pattern) ────────────────
    permAdd: 'perm-add',
    permRow: (id: string) => `perm-row-${id}`,
    permRoleSelect: 'perm-role-select',
    permRemove: (id: string) => `perm-remove-${id}`,
    peopleSearchInput: 'people-search-input',
    peopleSuggestion: (id: string) => `people-suggestion-${id}`,

    // ── MetadataPanel (custom properties / item fields) ──────────────────────
    metadataAdd: 'metadata-add',
    metadataKeyInput: 'metadata-key-input',
    metadataValueInput: 'metadata-value-input',
    metadataRow: (key: string) => `metadata-row-${key}`,
    metadataSave: 'metadata-save',
    metadataDelete: (key: string) => `metadata-delete-${key}`,

    // ── SettingsPanel ────────────────────────────────────────────────────────
    settingsSave: 'settings-save',
    settingsField: (name: string) => `settings-field-${name}`,

    // ── ColumnsPanel ─────────────────────────────────────────────────────────
    columnAdd: 'column-add',
    columnRow: (id: string) => `column-row-${id}`,
    columnNameInput: 'column-name-input',
    columnSave: 'column-save',
    columnDelete: (id: string) => `column-delete-${id}`,

    // ── VersionsPanel ────────────────────────────────────────────────────────
    versionRow: (id: string) => `version-row-${id}`,
    versionRestore: (id: string) => `version-restore-${id}`,
    versionDelete: (id: string) => `version-delete-${id}`,
    versionDownload: (id: string) => `version-download-${id}`,

    // ── FilePropertiesPanel ──────────────────────────────────────────────────
    propertiesPanel: 'properties-panel',

    // ── NetworkDrawer ────────────────────────────────────────────────────────
    networkDrawer: 'network-drawer',
    networkExportHar: 'network-export-har',
    networkClear: 'network-clear',
    networkRow: (index: number) => `network-row-${index}`,
} as const;
