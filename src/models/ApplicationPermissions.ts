/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class ApplicationPermissions {
    // instance properties
    public readonly appId: string;
    public readonly delegated: string[];
    public readonly appOnly: string[];

    public constructor(appId: string, delegated: string[], appOnly: string[]) {
        this.appId = appId;
        this.delegated = delegated;
        this.appOnly = appOnly;
    }
}