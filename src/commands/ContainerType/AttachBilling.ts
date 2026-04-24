/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { LocalRegistrationTreeItem } from '../../views/treeview/development/LocalRegistrationTreeItem';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { attachBillingToContainerType } from '../ContainerTypes/attachBillingToContainerType';

/**
 * Attach Azure billing to a container type whose billing isn't set up yet.
 * Works on both levels of the tree:
 *   - `ContainerTypeTreeItem` — standard CT, owner-side billing attach
 *   - `LocalRegistrationTreeItem` — direct-to-customer, consumer-side billing
 *     attach against the signed-in consumer tenant's Azure subscription
 * The underlying ARM flow (pick sub/RG/region → register Syntex →
 * PUT Syntex account) is the same in both cases; what differs is which
 * tenant the caller is signed into.
 */
export class AttachBilling extends Command {
    public static readonly COMMAND = 'ContainerType.attachBilling';

    public static async run(
        treeItem?: ContainerTypeTreeItem | LocalRegistrationTreeItem
    ): Promise<void> {
        if (!treeItem?.containerType) {
            vscode.window.showErrorMessage(
                vscode.l10n.t('Select a container type or registration in the tree to attach billing.')
            );
            return;
        }

        const containerType = treeItem.containerType;
        const result = await attachBillingToContainerType(containerType, containerType.name);

        if (result === 'succeeded') {
            DevelopmentTreeViewProvider.instance.refresh();
            vscode.window.showInformationMessage(
                vscode.l10n.t('Billing attached to container type "{0}".', containerType.name)
            );
        }
    }
}
