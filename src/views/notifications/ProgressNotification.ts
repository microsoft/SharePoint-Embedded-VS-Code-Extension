/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class ProgressNotification {

    public constructor() { }

    public async show() {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Application Status",
            cancellable: true
        }, (progress, token) => {
            token.onCancellationRequested(() => {
                console.log("User canceled the long running operation");
            });
    
            const progressSteps = [
                { increment: 0, message: "Creation started" },
                { increment: 20, message: "Configuring properties..." },
                { increment: 20, message: "Configuring properties..." },
                { increment: 20, message: "Configuring properties..." },
                { increment: 20, message: "Configuring properties..." },
                { increment: 20, message: "Almost there..." }
            ];
    
            const reportProgress = (step: any, delay: number) => {
                setTimeout(() => {
                    progress.report(step);
                }, delay);
            };
    
            for (let i = 0; i < progressSteps.length; i++) {
                reportProgress(progressSteps[i], i * 6000); // Adjust the delay as needed
            }
    
            return new Promise<void>((resolve) => {
                setTimeout(() => {
                    resolve();
                }, progressSteps.length * 6000);
            });
        });
    }
}
