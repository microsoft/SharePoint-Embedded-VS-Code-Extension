/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { TreeViewCommand } from "./treeViewCommand";

export class SecondaryApplicationTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public image?: { name: string; custom: boolean },
        public commandArguments?: any[]

    ) {
        super(label, collapsibleState)
        this.setImagetoIcon();
    }

    public async getChildren() {
        const createPostmanEnvButton = new TreeViewCommand(
            "Export Postman Config",
            "Create a Postman config based on the application details",
            "spe.exportPostmanConfig",
            this.commandArguments,
            { name: "symbol-property", custom: false }
        );

        const loadSampleAppButton = new TreeViewCommand(
            "Load Sample App",
            "Clone sample app template",
            "spe.cloneRepo",
            this.commandArguments,
            { name: "symbol-package", custom: false }
        );

        return [createPostmanEnvButton, loadSampleAppButton];
    }

    private setImagetoIcon() {
        if (this.image !== undefined) {
            if (!this.image.custom) {
                this.iconPath = new vscode.ThemeIcon(
                    this.image.name,
                    new vscode.ThemeColor("icon.foreground")
                );
            }
        }
    }

}