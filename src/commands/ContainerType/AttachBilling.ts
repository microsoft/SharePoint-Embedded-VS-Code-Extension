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
import { promptDirectToCustomerBillingSetup } from '../ContainerTypes/promptDirectToCustomerBillingSetup';
import { GraphProvider } from '../../services/Graph/GraphProvider';

/**
 * Attach billing to a container type whose billing isn't set up yet.
 *
 * Branches by classification:
 *   - `standard` → run the Azure ARM flow (pick sub/RG → register Syntex →
 *     PUT Syntex account). Owner-side billing.
 *   - `directToCustomer` → no ARM flow. Per docs, billing is configured by
 *     the user-org admin in the Microsoft 365 admin center, so we re-run
 *     the post-registration prompt (deep-link for GAs, info toast for
 *     non-admins).
 *
 * Wired on both `ContainerTypeTreeItem` and `LocalRegistrationTreeItem`
 * (their context values gate the menu when billingStatus is invalid).
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

        if (containerType.billingClassification === 'directToCustomer') {
            await promptDirectToCustomerBillingSetup(
                GraphProvider.getInstance().registrations,
                containerType
            );
            return;
        }

        const result = await attachBillingToContainerType(containerType, containerType.name);
        if (result === 'succeeded') {
            DevelopmentTreeViewProvider.instance.refresh();
            vscode.window.showInformationMessage(
                vscode.l10n.t('Billing attached to container type "{0}".', containerType.name)
            );
        }
    }
}
