/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContainerType, ContainerTypeRegistration } from '../../../models/schemas';
import type { StorageExplorerReadiness } from '../../../services/StorageExplorer/protocol';

/**
 * The single entry point to Storage Explorer under a container type.
 *
 * It replaces the old `Containers` / `Recycled containers` sub-trees, which duplicated the
 * webview's job and only appeared once a container type was fully set up — leaving a newly
 * created container type with nothing to click and no explanation.
 *
 * This row is therefore **always present**, including for unregistered, permission-incomplete
 * and billing-blocked container types. Those states render muted and carry a tooltip naming
 * the exact next action, so "not ready yet" is visible rather than silently absent.
 */
export class StorageExplorerTreeItem extends vscode.TreeItem {
    public constructor(
        public readonly containerType: ContainerType,
        public readonly registration: ContainerTypeRegistration | null,
        public readonly readiness: StorageExplorerReadiness
    ) {
        super(vscode.l10n.t('Storage Explorer'), vscode.TreeItemCollapsibleState.None);
        this.id = `spe-storage-explorer-${containerType.id}`;
        this.contextValue = `spe:storageExplorerTreeItem-${readiness}`;

        // Every state opens the panel. A blocked panel renders the onboarding surface and
        // issues no container or file operations, so clicking is always safe — and always
        // more useful than a row that does nothing.
        this.command = {
            command: 'spe.ContainerType.openStorageExplorer',
            title: vscode.l10n.t('Open Storage Explorer'),
            arguments: [this],
        };

        switch (readiness) {
            case 'ready':
                this.iconPath = new vscode.ThemeIcon('database');
                this.tooltip = new vscode.MarkdownString(vscode.l10n.t(
                    '**Storage Explorer**\n\nBrowse containers, create folders, and upload files for this container type.'
                ));
                break;

            case 'unregistered':
                this.description = vscode.l10n.t('⚠ Not registered');
                this.iconPath = new vscode.ThemeIcon(
                    'database',
                    new vscode.ThemeColor('list.warningForeground')
                );
                this.tooltip = new vscode.MarkdownString(vscode.l10n.t(
                    '**Storage Explorer is not available yet.**\n\nThis container type is not registered on your local tenant. Right-click the container type and choose **Register on local tenant** to continue.'
                ));
                break;

            case 'missingPermissions':
                this.description = vscode.l10n.t('⚠ App permissions required');
                this.iconPath = new vscode.ThemeIcon(
                    'database',
                    new vscode.ThemeColor('list.warningForeground')
                );
                this.tooltip = new vscode.MarkdownString(vscode.l10n.t(
                    '**Storage Explorer needs permissions.**\n\nThe SharePoint Embedded extension app does not have the delegated permissions it needs on this container type. Right-click the container type and choose **Grant extension app permissions** to continue.'
                ));
                break;

            case 'billingBlocked':
                this.description = vscode.l10n.t('⚠ Billing required');
                this.iconPath = new vscode.ThemeIcon(
                    'database',
                    new vscode.ThemeColor('list.warningForeground')
                );
                this.tooltip = new vscode.MarkdownString(vscode.l10n.t(
                    '**Storage Explorer is unavailable until billing is set up.**\n\nContainers cannot be created or read for this container type yet. Right-click the container type and choose **Attach billing** to finish setup.'
                ));
                break;
        }
    }
}
