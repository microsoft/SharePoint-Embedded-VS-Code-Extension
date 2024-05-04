/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class ProgressWaitNotification {
    private _hidden: boolean = true;
    public get hidden(): boolean {
        return this._hidden;
    }

    public constructor(protected title: string, protected cancellable: boolean = false) { }
    public async show(): Promise<void> {
        this._hidden = false;
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: this.title,
            cancellable: this.cancellable
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                this._hidden = true;
            });
            return new Promise<void>((resolve) => {
                const interval = setInterval(() => {
                    if (this._hidden) {
                        clearInterval(interval);
                        return resolve();
                    }
                }, 100);
            }); 
        });
    }
    public hide(): void {
        this._hidden = true;
    }
}

export class Timer {
    private _end: number;
    public get finished(): boolean {
        return Date.now() >= this._end;
    }
    public constructor(duration: number) {
        this._end = Date.now() + duration;
    }
}
