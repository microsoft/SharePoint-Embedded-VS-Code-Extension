/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class ProgressNotificationNew {

    public constructor(protected title: string, protected duration: number) { }
    public async show(): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: this.title,
            cancellable: false
        }, async () => {
            return new Promise(resolve => setTimeout(resolve, this.duration * 1000));
        });
    }
}
