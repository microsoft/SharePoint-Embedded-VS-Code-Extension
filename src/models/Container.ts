/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class Container {
    // instance properties
    public readonly id: string;
    public readonly displayName: string;
    public readonly description: string;
    public readonly containerTypeId: string;
    public readonly status: string;
    public createdDateTime?: string;

    public constructor(id: string, displayName: string, description: string, containerTypeId: string, status: string, createdDateTime?: string) {
        this.id = id;
        this.displayName = displayName;
        this.description = description;
        this.containerTypeId = containerTypeId;
        this.status = status;
        this.createdDateTime = createdDateTime;
    }
}