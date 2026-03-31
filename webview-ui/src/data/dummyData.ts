/*
 * Dummy data used during UI development.
 * Isolated here so it can be swapped out for real API data later without
 * touching any component or context files.
 */

import { StorageItem, NetworkRequest } from '../models/StorageItem';

export const DUMMY_APP_INFO = {
    name: 'Contoso Files App',
    tenantDomain: 'contoso.sharepoint.com',
};

export const ROOT_ITEMS: StorageItem[] = [
    { id: 'c1', name: 'Marketing', kind: 'container', modifiedAt: 'Mar 15, 2024', type: 'Container', size: '2.4 GB', description: 'Marketing team files and campaign assets' },
    { id: 'c2', name: 'Legal', kind: 'container', modifiedAt: 'Feb 28, 2024', type: 'Container', size: '890 MB', description: 'Legal documents and contracts' },
    { id: 'c3', name: 'Engineering', kind: 'container', modifiedAt: 'Mar 20, 2024', type: 'Container', size: '5.1 GB', description: 'Engineering team resources and specs' },
    { id: 'c4', name: 'HR', kind: 'container', modifiedAt: 'Jan 10, 2024', type: 'Container', size: '320 MB', description: 'Human resources and personnel documents' },
];

export const ITEMS_BY_ID: Record<string, StorageItem[]> = {
    c1: [
        { id: 'c1-f1', name: 'Q1 Campaign', kind: 'folder', modifiedAt: 'Mar 10, 2024', type: 'Folder', size: '' },
        { id: 'c1-f2', name: 'Brand Assets', kind: 'folder', modifiedAt: 'Feb 20, 2024', type: 'Folder', size: '' },
        { id: 'c1-d1', name: 'Brand Guide.pdf', kind: 'file', modifiedAt: 'Feb 14, 2024', type: 'PDF Document', size: '4.2 MB', mimeType: 'application/pdf' },
        { id: 'c1-d2', name: 'Campaign Deck.pptx', kind: 'file', modifiedAt: 'Mar 5, 2024', type: 'Presentation', size: '8.7 MB', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
        { id: 'c1-d3', name: 'Logo Pack.zip', kind: 'file', modifiedAt: 'Jan 30, 2024', type: 'ZIP Archive', size: '128 MB', mimeType: 'application/zip' },
    ],
    'c1-f1': [
        { id: 'c1-f1-d1', name: 'Email Campaign.docx', kind: 'file', modifiedAt: 'Mar 8, 2024', type: 'Word Document', size: '2.1 MB', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        { id: 'c1-f1-d2', name: 'Campaign Budget.xlsx', kind: 'file', modifiedAt: 'Feb 29, 2024', type: 'Spreadsheet', size: '450 KB', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        { id: 'c1-f1-d3', name: 'Social Media Post.png', kind: 'file', modifiedAt: 'Mar 9, 2024', type: 'Image', size: '1.8 MB', mimeType: 'image/png' },
    ],
    'c1-f2': [
        { id: 'c1-f2-d1', name: 'Primary Logo.svg', kind: 'file', modifiedAt: 'Nov 12, 2023', type: 'Image', size: '42 KB', mimeType: 'image/svg+xml' },
        { id: 'c1-f2-d2', name: 'Color Palette.pdf', kind: 'file', modifiedAt: 'Oct 5, 2023', type: 'PDF Document', size: '800 KB', mimeType: 'application/pdf' },
    ],
    c2: [
        { id: 'c2-f1', name: 'Contracts', kind: 'folder', modifiedAt: 'Feb 27, 2024', type: 'Folder', size: '' },
        { id: 'c2-f2', name: 'NDAs', kind: 'folder', modifiedAt: 'Jan 15, 2024', type: 'Folder', size: '' },
        { id: 'c2-d1', name: 'Policy Handbook.pdf', kind: 'file', modifiedAt: 'Feb 20, 2024', type: 'PDF Document', size: '1.8 MB', mimeType: 'application/pdf' },
    ],
    c3: [
        { id: 'c3-f1', name: 'Product Specs', kind: 'folder', modifiedAt: 'Mar 19, 2024', type: 'Folder', size: '' },
        { id: 'c3-f2', name: 'Architecture', kind: 'folder', modifiedAt: 'Mar 18, 2024', type: 'Folder', size: '' },
        { id: 'c3-d1', name: 'Requirements.docx', kind: 'file', modifiedAt: 'Mar 15, 2024', type: 'Word Document', size: '340 KB', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        { id: 'c3-d2', name: 'Tech Roadmap.xlsx', kind: 'file', modifiedAt: 'Mar 14, 2024', type: 'Spreadsheet', size: '2.3 MB', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        { id: 'c3-d3', name: 'API Reference.md', kind: 'file', modifiedAt: 'Mar 10, 2024', type: 'Markdown', size: '78 KB', mimeType: 'text/markdown' },
    ],
    c4: [
        { id: 'c4-f1', name: 'Job Postings', kind: 'folder', modifiedAt: 'Jan 8, 2024', type: 'Folder', size: '' },
        { id: 'c4-d1', name: 'Employee Handbook.pdf', kind: 'file', modifiedAt: 'Dec 15, 2023', type: 'PDF Document', size: '3.2 MB', mimeType: 'application/pdf' },
        { id: 'c4-d2', name: 'Benefits Overview.pdf', kind: 'file', modifiedAt: 'Nov 30, 2023', type: 'PDF Document', size: '1.1 MB', mimeType: 'application/pdf' },
    ],
};

export const DUMMY_METADATA = [
    { name: 'Department', value: 'Marketing' },
    { name: 'Status', value: 'Active' },
    { name: 'Owner', value: 'jane.doe@contoso.com' },
    { name: 'Fiscal Year', value: '2024' },
    { name: 'Confidentiality', value: 'Internal' },
];

export const DUMMY_VERSIONS = [
    { version: '3.0', modifiedBy: 'Jane Doe', modifiedAt: 'Mar 10, 2024, 2:34 PM', size: '4.2 MB', isCurrent: true },
    { version: '2.0', modifiedBy: 'John Smith', modifiedAt: 'Feb 5, 2024, 11:20 AM', size: '3.8 MB', isCurrent: false },
    { version: '1.0', modifiedBy: 'Jane Doe', modifiedAt: 'Jan 15, 2024, 9:00 AM', size: '3.1 MB', isCurrent: false },
];

export const DELETED_CONTAINERS: StorageItem[] = [
    { id: 'del-c1', name: 'Old Projects', kind: 'container', modifiedAt: 'Mar 25, 2024', type: 'Container', size: '', description: 'Archived project files from 2023' },
    { id: 'del-c2', name: 'Temp Storage', kind: 'container', modifiedAt: 'Mar 18, 2024', type: 'Container', size: '', description: '' },
    { id: 'del-c3', name: 'Legacy Data', kind: 'container', modifiedAt: 'Feb 10, 2024', type: 'Container', size: '', description: 'Pre-migration data' },
];

export const RECYCLED_ITEMS_BY_CONTAINER_ID: Record<string, StorageItem[]> = {
    c1: [
        { id: 'rc1-d1', name: 'Old Campaign Brief.pdf', kind: 'file', modifiedAt: 'Mar 22, 2024', type: 'PDF Document', size: '2.1 MB', mimeType: 'application/pdf' },
        { id: 'rc1-f1', name: 'Archived Assets', kind: 'folder', modifiedAt: 'Mar 19, 2024', type: 'Folder', size: '' },
        { id: 'rc1-d2', name: 'Draft Press Release.docx', kind: 'file', modifiedAt: 'Mar 15, 2024', type: 'Word Document', size: '340 KB', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    ],
    c2: [
        { id: 'rc2-d1', name: 'Expired Contract.pdf', kind: 'file', modifiedAt: 'Feb 28, 2024', type: 'PDF Document', size: '1.2 MB', mimeType: 'application/pdf' },
    ],
    c3: [],
    c4: [
        { id: 'rc4-f1', name: 'Old Job Postings', kind: 'folder', modifiedAt: 'Jan 5, 2024', type: 'Folder', size: '' },
        { id: 'rc4-d1', name: 'Outdated Handbook.pdf', kind: 'file', modifiedAt: 'Dec 1, 2023', type: 'PDF Document', size: '2.8 MB', mimeType: 'application/pdf' },
    ],
};

export const DEFAULT_RETENTION_DAYS = 93;

const BASE_TIME = new Date('2024-03-20T14:00:00Z').getTime();

function isoAt(offsetMs: number) {
    return new Date(BASE_TIME + offsetMs).toISOString();
}

export const DUMMY_NETWORK_REQUESTS: NetworkRequest[] = [
    {
        id: 'req-1',
        method: 'GET',
        url: 'https://graph.microsoft.com/v1.0/storage/fileStorage/containers?$filter=containerTypeId eq \'aabbccdd-1234-5678-abcd-000000000001\'',
        status: 200,
        statusText: 'OK',
        durationMs: 312,
        timestamp: isoAt(0),
        requestHeaders: { 'Content-Type': 'application/json', 'ConsistencyLevel': 'eventual' },
        responseHeaders: { 'Content-Type': 'application/json; odata.metadata=minimal', 'x-ms-request-id': 'abc123' },
        responseBody: JSON.stringify({ value: [{ id: 'c1', displayName: 'Marketing' }, { id: 'c2', displayName: 'Legal' }] }, null, 2),
    },
    {
        id: 'req-2',
        method: 'GET',
        url: 'https://graph.microsoft.com/v1.0/storage/fileStorage/containers/c1/drive/root/children',
        status: 200,
        statusText: 'OK',
        durationMs: 189,
        timestamp: isoAt(500),
        requestHeaders: { 'Content-Type': 'application/json' },
        responseHeaders: { 'Content-Type': 'application/json; odata.metadata=minimal', 'x-ms-request-id': 'def456' },
        responseBody: JSON.stringify({ value: [{ name: 'Q1 Campaign', folder: {} }, { name: 'Brand Guide.pdf', file: {} }] }, null, 2),
    },
    {
        id: 'req-3',
        method: 'PATCH',
        url: 'https://graph.microsoft.com/v1.0/storage/fileStorage/containers/c1',
        status: 200,
        statusText: 'OK',
        durationMs: 241,
        timestamp: isoAt(3000),
        requestHeaders: { 'Content-Type': 'application/json' },
        requestBody: JSON.stringify({ displayName: 'Marketing (Renamed)' }, null, 2),
        responseHeaders: { 'Content-Type': 'application/json; odata.metadata=minimal' },
        responseBody: JSON.stringify({ id: 'c1', displayName: 'Marketing (Renamed)' }, null, 2),
    },
    {
        id: 'req-4',
        method: 'GET',
        url: 'https://graph.microsoft.com/v1.0/storage/fileStorage/containers/c1/drive/root/children?$top=100&$skip=100',
        status: 404,
        statusText: 'Not Found',
        durationMs: 98,
        timestamp: isoAt(5200),
        requestHeaders: { 'Content-Type': 'application/json' },
        responseHeaders: { 'Content-Type': 'application/json; odata.metadata=minimal' },
        responseBody: JSON.stringify({ error: { code: 'itemNotFound', message: 'The resource could not be found.' } }, null, 2),
    },
    {
        id: 'req-5',
        method: 'DELETE',
        url: 'https://graph.microsoft.com/v1.0/storage/fileStorage/containers/c2/drive/items/item-007',
        status: 204,
        statusText: 'No Content',
        durationMs: 157,
        timestamp: isoAt(8000),
        requestHeaders: { 'Content-Type': 'application/json' },
        responseHeaders: {},
    },
];

export const DUMMY_PERMISSIONS = [
    { identity: 'jane.doe@contoso.com', role: 'Owner', type: 'User' },
    { identity: 'john.smith@contoso.com', role: 'Write', type: 'User' },
    { identity: 'Marketing Team', role: 'Read', type: 'Group' },
];

// ── DriveItem permissions (files & folders) ───────────────────────────────────────

export type DriveRole = 'read' | 'write' | 'owner';
export type LinkType = 'view' | 'edit' | 'embed';
export type LinkScope = 'anonymous' | 'organization' | 'existingAccess';

export interface DriveIdentity {
    userPrincipalName: string;
    displayName: string;
}

export interface DriveItemPermission {
    id: string;
    roles: DriveRole[];
    shareId?: string;
    expirationDateTime?: string;
    grantedToV2?: {
        user?: DriveIdentity;
        group?: DriveIdentity;
    };
    invitation?: {
        email: string;
        signInRequired: boolean;
        invitedBy?: { user?: DriveIdentity };
    };
    link?: {
        type: LinkType;
        scope: LinkScope;
        webUrl: string;
        webHtml?: string;
        preventsDownload: boolean;
    };
    inheritedFrom?: {
        id: string;
        path: string;
    };
}

export const DUMMY_DRIVE_PERMISSIONS: DriveItemPermission[] = [
    {
        id: 'perm-1',
        roles: ['owner'],
        grantedToV2: { user: { userPrincipalName: 'jane.doe@contoso.com', displayName: 'Jane Doe' } },
    },
    {
        id: 'perm-2',
        roles: ['write'],
        grantedToV2: { user: { userPrincipalName: 'john.smith@contoso.com', displayName: 'John Smith' } },
        expirationDateTime: '2026-09-30T23:59:59Z',
    },
    {
        id: 'perm-3',
        roles: ['read'],
        grantedToV2: { group: { userPrincipalName: 'marketing@contoso.com', displayName: 'Marketing Team' } },
    },
    {
        id: 'perm-4',
        roles: ['read'],
        shareId: 'share-abc123',
        link: {
            type: 'view',
            scope: 'anonymous',
            webUrl: 'https://contoso.sharepoint.com/:b:/s/share-abc123',
            preventsDownload: true,
        },
        expirationDateTime: '2026-12-31T23:59:59Z',
    },
    {
        id: 'perm-5',
        roles: ['write'],
        shareId: 'share-def456',
        link: {
            type: 'edit',
            scope: 'organization',
            webUrl: 'https://contoso.sharepoint.com/:w:/s/share-def456',
            preventsDownload: false,
        },
    },
    {
        id: 'perm-6',
        roles: ['read'],
        invitation: {
            email: 'alice.brown@external.com',
            signInRequired: true,
            invitedBy: { user: { userPrincipalName: 'jane.doe@contoso.com', displayName: 'Jane Doe' } },
        },
    },
    {
        id: 'perm-7',
        roles: ['read'],
        grantedToV2: { group: { userPrincipalName: 'allemployees@contoso.com', displayName: 'All Employees' } },
        inheritedFrom: { id: 'parent-folder', path: '/Marketing' },
    },
];

// ── Container permissions ───────────────────────────────────────────────────

export type ContainerRole = 'owner' | 'manager' | 'writer' | 'reader';

export interface PermissionMember {
    id: string;
    displayName: string;
    email: string;
    type: 'user' | 'group';
}

export const DUMMY_CONTAINER_PERMISSIONS: Record<ContainerRole, PermissionMember[]> = {
    owner: [
        { id: 'u1', displayName: 'Jane Doe', email: 'jane.doe@contoso.com', type: 'user' },
        { id: 'u2', displayName: 'John Smith', email: 'john.smith@contoso.com', type: 'user' },
    ],
    manager: [
        { id: 'g1', displayName: 'Marketing Team', email: 'marketing@contoso.com', type: 'group' },
    ],
    writer: [
        { id: 'u3', displayName: 'Alice Brown', email: 'alice.brown@contoso.com', type: 'user' },
        { id: 'u4', displayName: 'Bob Wilson', email: 'bob.wilson@contoso.com', type: 'user' },
    ],
    reader: [
        { id: 'g2', displayName: 'All Employees', email: 'allemployees@contoso.com', type: 'group' },
        { id: 'u5', displayName: 'Charlie Davis', email: 'charlie.davis@contoso.com', type: 'user' },
    ],
};

export const DUMMY_USERS_AND_GROUPS: PermissionMember[] = [
    { id: 'u1', displayName: 'Jane Doe', email: 'jane.doe@contoso.com', type: 'user' },
    { id: 'u2', displayName: 'John Smith', email: 'john.smith@contoso.com', type: 'user' },
    { id: 'u3', displayName: 'Alice Brown', email: 'alice.brown@contoso.com', type: 'user' },
    { id: 'u4', displayName: 'Bob Wilson', email: 'bob.wilson@contoso.com', type: 'user' },
    { id: 'u5', displayName: 'Charlie Davis', email: 'charlie.davis@contoso.com', type: 'user' },
    { id: 'u6', displayName: 'Diana Evans', email: 'diana.evans@contoso.com', type: 'user' },
    { id: 'u7', displayName: 'Edward Foster', email: 'edward.foster@contoso.com', type: 'user' },
    { id: 'g1', displayName: 'Marketing Team', email: 'marketing@contoso.com', type: 'group' },
    { id: 'g2', displayName: 'All Employees', email: 'allemployees@contoso.com', type: 'group' },
    { id: 'g3', displayName: 'Engineering Team', email: 'engineering@contoso.com', type: 'group' },
    { id: 'g4', displayName: 'Legal Team', email: 'legal@contoso.com', type: 'group' },
];

// ── Container columns ───────────────────────────────────────────────────────

export type ColumnTypeName =
    | 'text' | 'boolean' | 'dateTime' | 'currency'
    | 'choice' | 'hyperlinkOrPicture' | 'number' | 'personOrGroup';

export interface ContainerColumn {
    id: string;
    name: string;
    displayName: string;
    description: string;
    enforceUniqueValues: boolean;
    hidden: boolean;
    indexed: boolean;
    columnType: ColumnTypeName;
    /** Only present for choice columns */
    choiceSettings?: { choices: string[]; allowTextEntry: boolean };
    /** Only present for number columns */
    numberSettings?: { decimalPlaces?: string; displayAs?: 'number' | 'percentage'; minimum?: number; maximum?: number };
    /** Only present for dateTime columns */
    dateTimeSettings?: { format?: 'dateOnly' | 'dateTime' };
    /** Only present for currency columns */
    currencySettings?: { locale?: string };
    /** Only present for hyperlinkOrPicture columns */
    hyperlinkSettings?: { isPicture?: boolean };
    /** Only present for personOrGroup columns */
    personOrGroupSettings?: { allowMultipleSelection?: boolean; chooseFromType?: 'peopleAndGroups' | 'peopleOnly' };
}

export const DUMMY_CONTAINER_COLUMNS: ContainerColumn[] = [
    { id: 'col1', name: 'Department', displayName: 'Department', description: 'Owning department', enforceUniqueValues: false, hidden: false, indexed: true, columnType: 'text' },
    { id: 'col2', name: 'Status', displayName: 'Status', description: 'Approval status', enforceUniqueValues: false, hidden: false, indexed: true, columnType: 'choice',
      choiceSettings: { choices: ['Draft', 'Under Review', 'Approved', 'Rejected'], allowTextEntry: false } },
    { id: 'col3', name: 'ExpiryDate', displayName: 'Expiry Date', description: 'Document expiry date', enforceUniqueValues: false, hidden: false, indexed: false, columnType: 'dateTime',
      dateTimeSettings: { format: 'dateOnly' } },
    { id: 'col4', name: 'Confidential', displayName: 'Confidential', description: 'Mark as confidential', enforceUniqueValues: false, hidden: false, indexed: false, columnType: 'boolean' },
    { id: 'col5', name: 'Budget', displayName: 'Budget', description: 'Allocated budget (USD)', enforceUniqueValues: false, hidden: false, indexed: false, columnType: 'currency',
      currencySettings: { locale: 'en-us' } },
    { id: 'col6', name: 'ReviewedBy', displayName: 'Reviewed By', description: 'Person who reviewed this document', enforceUniqueValues: false, hidden: false, indexed: false, columnType: 'personOrGroup',
      personOrGroupSettings: { allowMultipleSelection: false, chooseFromType: 'peopleOnly' } },
    { id: 'col7', name: 'ReferenceUrl', displayName: 'Reference URL', description: 'Link to related resource', enforceUniqueValues: false, hidden: false, indexed: false, columnType: 'hyperlinkOrPicture',
      hyperlinkSettings: { isPicture: false } },
    { id: 'col8', name: 'Priority', displayName: 'Priority', description: 'Numeric priority (1–10)', enforceUniqueValues: false, hidden: false, indexed: false, columnType: 'number',
      numberSettings: { decimalPlaces: 'none', displayAs: 'number', minimum: 1, maximum: 10 } },
];

// ── Container metadata (custom properties) ──────────────────────────────────

export interface ContainerCustomProperty {
    key: string;
    value: string;
    isSearchable: boolean;
}

export const DUMMY_CONTAINER_METADATA: ContainerCustomProperty[] = [
    { key: 'costCenter', value: 'CC-4821', isSearchable: true },
    { key: 'projectPhase', value: 'Planning', isSearchable: true },
    { key: 'internalNotes', value: 'Requires approval before sharing', isSearchable: false },
];

// ── DriveItem fields (files & folders) ──────────────────────────────────────────────

/** Record<columnName, serialized-string-value> */
export const DUMMY_ITEM_FIELDS: Record<string, Record<string, string>> = {
    'c1-d1': { Department: 'Marketing', Status: 'Approved', Confidential: 'true' },
    'c1-d2': { Department: 'Marketing', Status: 'Under Review', Budget: '15000' },
    'c1-d3': { Confidential: 'false' },
    'c1-f1': { Department: 'Marketing', Status: 'Draft' },
    'c3-d1': { Department: 'Engineering', Status: 'Approved', Priority: '3', ExpiryDate: '2027-06-30' },
    'c3-d2': { Department: 'Engineering', ReviewedBy: 'jane.doe@contoso.com' },
};
