/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Command } from '../../Command';
import { AppTreeItem } from '../../../views/treeview/development/AppTreeItem';
import { DevelopmentTreeViewProvider } from '../../../views/treeview/development/DevelopmentTreeViewProvider';
import { ProgressWaitNotification } from '../../../views/notifications/ProgressWaitNotification';
import { GuestApplicationTreeItem } from '../../../views/treeview/development/GuestAppTreeItem';
import { OwningAppTreeItem } from '../../../views/treeview/development/OwningAppTreeItem';
import { GraphProvider } from '../../../services/Graph/GraphProvider';
import { Application } from '../../../models/schemas';
import { App } from '../../../models/App';
import { generateCertificateAndPrivateKey, createCertKeyCredential } from '../../../cert';
import { AuthenticationState } from '../../../services/AuthenticationState';

/**
 * Result of creating a certificate
 */
export interface CreateCertResult {
    appId: string;
    displayName: string;
    thumbprint: string;
    privateKey: string;
}

// Static class that creates a cert on an app
export class CreateAppCert extends Command {
    // Command name
    public static readonly COMMAND = 'App.Credentials.createCert';

    // Command handler
    public static async run(commandProps?: CreateCertProps): Promise<CreateCertResult | undefined> {
        if (!AuthenticationState.isSignedIn()) {
            vscode.window.showErrorMessage(vscode.l10n.t('Please sign in to create app certificates.'));
            return;
        }

        if (!commandProps) {
            return;
        }

        const graphProvider = GraphProvider.getInstance();

        // Extract app info from command props
        let appId: string | undefined;
        let objectId: string | undefined;
        let displayName: string | undefined;

        if (commandProps instanceof OwningAppTreeItem) {
            appId = commandProps.containerType.owningAppId;
            // Fetch the full application to get object ID
            const app = await graphProvider.applications.get(appId, { useAppId: true });
            if (app) {
                objectId = app.id;
                displayName = app.displayName;
            }
        } else if (commandProps instanceof GuestApplicationTreeItem) {
            // Guest app - get from appPerms
            const legacyApp = commandProps.appPerms?.app;
            if (legacyApp) {
                objectId = legacyApp.objectId;
                appId = legacyApp.clientId;
                displayName = legacyApp.displayName;
            }
        } else if (commandProps instanceof App) {
            // Legacy App model
            objectId = commandProps.objectId;
            appId = commandProps.clientId;
            displayName = commandProps.displayName;
        } else if ('id' in commandProps && 'appId' in commandProps) {
            // New Application schema
            objectId = commandProps.id;
            appId = commandProps.appId ?? undefined;
            displayName = commandProps.displayName;
        }

        if (!objectId || !appId) {
            vscode.window.showErrorMessage(vscode.l10n.t('Could not find application'));
            return;
        }

        const progressWindow = new ProgressWaitNotification(vscode.l10n.t('Creating app certificate...'));
        progressWindow.show();

        try {
            // Generate the certificate
            const { certificatePEM, privateKey, thumbprint } = generateCertificateAndPrivateKey();
            const keyCredential = createCertKeyCredential(certificatePEM);

            // Get current app to preserve existing keyCredentials
            const currentApp = await graphProvider.applications.get(objectId);
            const existingKeyCredentials = currentApp?.keyCredentials || [];

            // Add the new key credential - cast to any since cert.ts uses @microsoft/microsoft-graph-types
            // which has slightly different nullable types than our Zod schema
            await graphProvider.applications.update(objectId, {
                keyCredentials: [...existingKeyCredentials, keyCredential as any]
            });

            progressWindow.hide();

            // Ask user if they want to save the private key
            const saveChoice = await vscode.window.showInformationMessage(
                vscode.l10n.t('Certificate created for app "{0}". The private key is NOT stored locally. Do you want to save it to a file?', displayName || appId),
                vscode.l10n.t('Save Private Key'),
                vscode.l10n.t('Copy to Clipboard'),
                vscode.l10n.t('Skip')
            );

            if (saveChoice === vscode.l10n.t('Save Private Key')) {
                const folders = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: vscode.l10n.t('Save Here'),
                });

                if (folders && folders.length > 0) {
                    const destinationPath = folders[0].fsPath;
                    const keyFilePath = path.join(destinationPath, `${appId}_private_key.pem`);
                    const certFilePath = path.join(destinationPath, `${appId}_certificate.pem`);

                    fs.writeFileSync(keyFilePath, privateKey, 'utf8');
                    fs.writeFileSync(certFilePath, certificatePEM, 'utf8');

                    vscode.window.showInformationMessage(
                        vscode.l10n.t('Private key saved to {0}. Thumbprint: {1}', keyFilePath, thumbprint)
                    );
                }
            } else if (saveChoice === vscode.l10n.t('Copy to Clipboard')) {
                await vscode.env.clipboard.writeText(privateKey);
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Private key copied to clipboard. Thumbprint: {0}', thumbprint)
                );
            } else {
                // Show thumbprint even if they skip saving
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Certificate thumbprint: {0}', thumbprint)
                );
            }

            DevelopmentTreeViewProvider.getInstance().refresh();

            return {
                appId,
                displayName: displayName || appId,
                thumbprint,
                privateKey
            };
        } catch (error: any) {
            progressWindow.hide();
            console.error('[CreateAppCert] Error creating certificate:', error);

            let errorMessage = vscode.l10n.t('Failed to create certificate');
            if (error.message) {
                errorMessage += `: ${error.message}`;
            }

            vscode.window.showErrorMessage(errorMessage);
            return;
        }
    };
}

export type CreateCertProps = AppTreeItem | Application | App;
