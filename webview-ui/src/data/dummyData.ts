/*
 * Dummy data used during UI development.
 * Isolated here so it can be swapped out for real API data later without
 * touching any component or context files.
 */

import { StorageItem } from '../models/StorageItem';

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

export const DUMMY_PERMISSIONS = [
    { identity: 'jane.doe@contoso.com', role: 'Owner', type: 'User' },
    { identity: 'john.smith@contoso.com', role: 'Write', type: 'User' },
    { identity: 'Marketing Team', role: 'Read', type: 'Group' },
];
