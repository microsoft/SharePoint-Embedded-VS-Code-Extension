/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
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

export class ActiveContainersError { 
    public static serverMessage: string = "Trial Container Type cannot be deleted as there are active containers associated to it.";
    public static uiMessage: string = vscode.l10n.t("Trial Container Type cannot be deleted as there are active containers associated to it. Please ensure there are no active containers and no containers in the recycle bin before proceeding.");   
}

export class ActiveRecycledContainersError { 
    public static serverMessage: string = " Trial Container Type cannot be deleted as there are containers in the Recycle Bin associated to it.";
    public static uiMessage: string = vscode.l10n.t("Trial Container Type cannot be deleted as there are active containers associated to it. Please ensure there are no active containers and no containers in the recycle bin before proceeding.");   
}
