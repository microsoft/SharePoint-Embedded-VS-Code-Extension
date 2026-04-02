import { Client } from '@microsoft/microsoft-graph-client';
import { StorageItem } from '../../models/StorageItem';
import { WebviewAuthProvider } from '../WebviewAuthProvider';

export class DriveGraphService {
    constructor(
        private readonly _client: Client,
        private readonly _authProvider: WebviewAuthProvider,
    ) {}

    /** List the children of a folder or drive root. */
    async listChildren(_itemId: string): Promise<StorageItem[]> {
        throw new Error('DriveGraphService.listChildren: not yet implemented');
    }

    /** Get a single drive item by ID. */
    async get(_itemId: string): Promise<StorageItem | null> {
        throw new Error('DriveGraphService.get: not yet implemented');
    }

    /** Create a new folder inside a container or folder. */
    async createFolder(_parentId: string, _name: string): Promise<StorageItem> {
        throw new Error('DriveGraphService.createFolder: not yet implemented');
    }

    /** Create a new Office document (Word, Excel, PowerPoint) in a folder. */
    async createOfficeFile(
        _parentId: string,
        _name: string,
        _type: 'docx' | 'xlsx' | 'pptx',
    ): Promise<StorageItem> {
        throw new Error('DriveGraphService.createOfficeFile: not yet implemented');
    }

    /** Rename a drive item. */
    async rename(_itemId: string, _newName: string): Promise<void> {
        throw new Error('DriveGraphService.rename: not yet implemented');
    }

    /** Move a drive item to the recycle bin. */
    async delete(_itemId: string): Promise<void> {
        throw new Error('DriveGraphService.delete: not yet implemented');
    }

    /** List items in the drive's recycle bin. */
    async listRecycleBin(_driveId: string): Promise<StorageItem[]> {
        throw new Error('DriveGraphService.listRecycleBin: not yet implemented');
    }

    /** Restore an item from the recycle bin. */
    async restoreFromRecycleBin(_driveId: string, _itemId: string): Promise<void> {
        throw new Error('DriveGraphService.restoreFromRecycleBin: not yet implemented');
    }

    /** Permanently delete an item from the recycle bin. */
    async permanentlyDelete(_driveId: string, _itemId: string): Promise<void> {
        throw new Error('DriveGraphService.permanentlyDelete: not yet implemented');
    }

    /** Get the listItem fields (custom metadata) for a drive item. */
    async getFields(_itemId: string): Promise<Record<string, unknown>> {
        throw new Error('DriveGraphService.getFields: not yet implemented');
    }

    /** Update the listItem fields (custom metadata) for a drive item. */
    async updateFields(_itemId: string, _fields: Record<string, unknown>): Promise<void> {
        throw new Error('DriveGraphService.updateFields: not yet implemented');
    }

    /** List version history for a drive item. */
    async listVersions(_itemId: string): Promise<unknown[]> {
        throw new Error('DriveGraphService.listVersions: not yet implemented');
    }

    /** Get the download URL for a specific version. */
    async getVersionDownloadUrl(_itemId: string, _versionId: string): Promise<string> {
        throw new Error('DriveGraphService.getVersionDownloadUrl: not yet implemented');
    }
}
