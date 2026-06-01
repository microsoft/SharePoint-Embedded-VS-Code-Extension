/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { ContainerType } from '../../models/schemas';
import { AuthenticationState } from '../../services/AuthenticationState';
import { GetOrCreateApp } from '../Apps/GetOrCreateApp';
import { pickBillingType } from './ui/pickBillingType';
import { promptForContainerTypeDisplayName } from './ui/promptForContainerTypeDisplayName';
import { runTrialFlow } from './CreateTrialContainerType';
import { runStandardFlow } from './runStandardFlow';
import { runDirectToCustomerFlow } from './runDirectToCustomerFlow';

/**
 * Unified "Create container type" entry point.
 *
 * Mirrors the SharePoint admin center flow: pick billing type → name the
 * container type → pick or create an Entra app → run the billing-specific
 * sub-flow.
 */
export class CreateContainerType extends Command {
    public static readonly COMMAND = 'ContainerTypes.create';

    public static async run(): Promise<ContainerType | undefined> {
        const isSignedIn = await AuthenticationState.isSignedIn();
        if (!isSignedIn) {
            vscode.window.showErrorMessage(vscode.l10n.t('Please sign in to create a container type.'));
            return;
        }

        const choice = await pickBillingType();
        if (!choice) {
            return;
        }

        const displayName = await promptForContainerTypeDisplayName();
        if (!displayName) {
            return;
        }

        const app = await GetOrCreateApp.run(true);
        if (!app) {
            return;
        }

        switch (choice) {
            case 'trial':
                return runTrialFlow({ displayName, app });
            case 'standard':
                return runStandardFlow({ displayName, app });
            case 'directToCustomer':
                return runDirectToCustomerFlow({ displayName, app });
        }
    }
}
