/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ContainerType } from "../../../models/ContainerType";
import { App } from "../../../models/App";
import { AppTreeItem } from "./AppTreeItem";

export class OwningAppTreeItem extends AppTreeItem {
    constructor(public readonly containerType: ContainerType) {
        const app = containerType.owningApp!;
        super(app);
        this.description = "(owning app)";
        this.contextValue += '-local';
        
        if (app.clientSecret) {
            this.contextValue += '-hasSecret';
        }
        if (app.thumbprint && app.privateKey) {
            this.contextValue += '-hasCert';
        }
    }
}