/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Account } from "../models/Account";

export class TermsOfServiceError extends Error {
    constructor() {
        const account = Account.get()!;
        const message =  `You will need to enable SharePoint repository services on your tenant before you can create a Container Type.
        You can do that in the [SharePoint Admin Center Settings page](https://${account.domain}-admin.sharepoint.com/_layouts/15/online/AdminHome.aspx#/settings).\n
        [Learn more](https://aka.ms/enable-spe)`;
        super(message);
        this.name = 'TermsOfServiceError';
        this.message = message;
    }
}

export class MaxFreeContainerTypesError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MaxFreeContainerTypesError';
    }
}
