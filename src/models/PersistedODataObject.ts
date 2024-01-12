/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
export abstract class IODataProperties {}

export interface PersistedODataObject {
    get storageKey(): string;
    saveToStorage(): Promise<void>;
    deleteFromStorage(): Promise<void>;
    toJSON(): string;
    //static loadFromStorage(storageKey: string): Promise<PersistedODataObject>;
    //static create(properties: IODataCreateProperties): Promise<PersistedODataObject>;
    //static fromJSON(json: string): PersistedODataObject;
}

abstract class ODataObject {

    protected constructor(properties: Object) {
        if (!this.confirmProperties(properties)) {
            throw new Error('Invalid properties for OData object');
        }
        Object.assign(this, properties);
    }
    
    abstract confirmProperties(properties: Object): boolean;

    private static fromJSON<T extends ODataObject>(json: string, type: { new({}): T;} ): T {
        return new type(JSON.parse(json));
    }

    public toJSON(): string {
        return JSON.stringify(this);
    }
}

export class CreateFreeContainerTypeProperties extends ODataObject {
    public readonly DisplayName!: string;
    public readonly OwningAppId!: string;
    public readonly Description?: string;
    public confirmProperties(properties: Object): boolean {
        return properties.hasOwnProperty('DisplayName') && 
            properties.hasOwnProperty('OwningAppId');
    }
}

export class ContainerTypeODataProperties extends CreateFreeContainerTypeProperties {
    public readonly ContainerTypeId!: string;
    public readonly AzureSubscriptionId?: string;
    public readonly CreationDate?: string;
    public readonly ExpiryDate?: string;
    public readonly IsBillingProfileRequired?: boolean;
    public readonly SPContainerTypeBillingClassification!: number;
    public confirmProperties(properties: Object): boolean {
        return super.confirmProperties(properties) &&
            properties.hasOwnProperty('ContainerTypeId') &&
            properties.hasOwnProperty('SPContainerTypeBillingClassification');
    }
}

export class ContainerTypeStoredProperties extends ContainerTypeODataProperties {
    private readonly _guestAppIds: Set<string> = new Set<string>();
    private readonly _registrationIds: Set<string> = new Set<string>();
}

export interface IFreeContainerTypeCreateProperties extends IODataProperties {
    readonly DisplayName: string;
    readonly OwningAppId: string;
}

export interface IContainerTypeProperties extends IFreeContainerTypeCreateProperties{
    readonly ContainerTypeId: string;
    readonly AzureSubscriptionId?: string;
    readonly CreationDate?: string;
    readonly ExpiryDate?: string;
    readonly IsBillingProfileRequired?: boolean;
    readonly SPContainerTypeBillingClassification: number;
}

interface IContainerTypeStoredProperties extends IContainerTypeProperties {
    readonly GuestAppIds: string[];
    readonly RegistrationIds: string[];
}

export class CT implements IContainerTypeStoredProperties, PersistedODataObject {

    // IContainerTypeProperties
    public readonly ContainerTypeId!: string;
    public readonly AzureSubscriptionId?: string | undefined;
    public readonly CreationDate?: string | undefined;
    public readonly ExpiryDate?: string | undefined;
    public readonly IsBillingProfileRequired?: boolean | undefined;
    public readonly DisplayName!: string;
    public readonly OwningAppId!: string;
    public readonly SPContainerTypeBillingClassification!: number;

    private _guestAppIds: Set<string> = new Set<string>();
    private _registrationIds: Set<string> = new Set<string>();

    // IContainerTypeStorageProperties
    public get GuestAppIds(): string[] {
        return Array.from(this._guestAppIds);
    }
    public get RegistrationIds(): string[] {
        return Array.from(this._registrationIds);
    }

    public constructor(properties: IContainerTypeProperties) {
        super(properties);
    }

    get storageKey(): string {
        return this.ContainerTypeId;
    }
    public saveToStorage(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    public deleteFromStorage(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    public static async loadFromStorage(storageKey: string): Promise<CT> {
        const properties = StorageProvider.get().global.getValue<IContainerTypeStorageProperties>(storageKey);
        if (!properties) {
            throw new Error(`Could not load Container Type with storage key ${storageKey}`);
        }
        const containerType = new CT(properties);

    }
}
*/