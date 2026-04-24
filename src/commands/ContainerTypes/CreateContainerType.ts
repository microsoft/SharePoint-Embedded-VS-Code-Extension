/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { ContainerType } from '../../models/schemas';
import { AuthenticationState } from '../../services/AuthenticationState';
import { GetOrCreateApp } from '../Apps/GetOrCreateApp';
import { pickBillingType, BillingChoice } from './ui/pickBillingType';
import { pickAppOwners } from './ui/pickAppOwners';
import { promptForContainerTypeDisplayName } from './ui/promptForContainerTypeDisplayName';
import { runTrialFlow } from './CreateTrialContainerType';
import { runStandardFlow } from './runStandardFlow';
import { runDirectToCustomerFlow } from './runDirectToCustomerFlow';

/**
 * Unified "Create container type" entry point.
 *
 * Mirrors the SharePoint admin center flow: pick billing type → pick or
 * create an Entra app → pick app owners → name the container type → run
 * the billing-specific sub-flow.
 *
 * Trial is wired end-to-end. Standard and Direct-to-customer are stubbed
 * with "coming soon" messages and will be wired up in later phases.
 */
export class CreateContainerType extends Command {
    public static readonly COMMAND = 'ContainerTypes.create';

    public static async run(): Promise<ContainerType | undefined> {
        const isSignedIn = await AuthenticationState.isSignedIn();
        if (!isSignedIn) {
            vscode.window.showErrorMessage(vscode.l10n.t('Please sign in to create a container type.'));
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

        const choice = await pickBillingType();
        if (!choice) {
            return;
        }

        const owners = await pickAppOwners({ max: 3 });
        if (!owners && choice !== 'trial') {
            // Picker returned undefined (escape or permission failure) — continue
            // without owners rather than aborting. The container type will be
            // created; the caller can assign owners later via Entra admin UI.
            vscode.window.showWarningMessage(
                vscode.l10n.t('No owners selected for the {0} container type. You can add them later from the Entra portal.', describeChoice(choice))
            );
        }

        switch (choice) {
            case 'trial':
                return runTrialFlow({ displayName, app, owners });
            case 'standard':
                return runStandardFlow({ displayName, app, owners: owners ?? [] });
            case 'directToCustomer':
                return runDirectToCustomerFlow({ displayName, app, owners: owners ?? [] });
        }
    }
}

function describeChoice(choice: BillingChoice): string {
    switch (choice) {
        case 'standard': return vscode.l10n.t('Standard');
        case 'directToCustomer': return vscode.l10n.t('Direct-to-customer');
        case 'trial': return vscode.l10n.t('Trial');
    }
}
