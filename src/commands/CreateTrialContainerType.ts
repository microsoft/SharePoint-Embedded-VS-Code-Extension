/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from './Command';
import { Account } from '../models/Account';
import { BillingClassification, ContainerType } from '../models/ContainerType';
import { ContainerTypeCreationFlow, ContainerTypeCreationFlowState } from '../views/qp/UxFlows';
import { ProgressNotification } from '../views/notifications/ProgressNotification';
import { App } from '../models/App';
import { DevelopmentTreeViewProvider } from '../views/treeview/development/DevelopmentTreeViewProvider';
import TelemetryProvider from '../services/TelemetryProvider';
import { AppCreationFailure, AppImportFailure, TermsOfServiceAcceptedFailure, TrialContainerTypeCreationFailure, TrialContainerTypeCreationFlowFailure, TrialContainerTypeFetchFailure, TrialContainerTypeImportFailure, TrialContainerTypeRegistrationFailure } from '../models/telemetry/telemetry';

// Static class that handles the create trial container type command
export class CreateTrialContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'createTrialContainerType';

    // Command handler
    public static async run(): Promise<void> {
        let account = Account.get()!;

        Account.onContainerTypeCreationStart();
        DevelopmentTreeViewProvider.getInstance().refresh();

        // Try to use an existing app to see if there's already a Free CT
        let freeCT: ContainerType | undefined;
        try {
            freeCT = await account.getFreeContainerType();
        } catch (error: any) {
            console.error(`Error fetching Free Trial Container Type: ${error}`);
            Account.onContainerTypeCreationFinish();
            DevelopmentTreeViewProvider.getInstance().refresh();
        }

        // Get parameters for new App and Container Type or owning App on existing Container Type
        let ctCreationState: ContainerTypeCreationFlowState | undefined;
        try {
            ctCreationState = await new ContainerTypeCreationFlow(freeCT).run();
            if (!ctCreationState) {
                throw new Error("Ux flow cancelled and state is undefined");
            }
        } catch (error: any) {
            Account.onContainerTypeCreationFinish();
            DevelopmentTreeViewProvider.getInstance().refresh();
            console.error(`Error with Trial Container Type creation Ux Flow: ${error}`);
            TelemetryProvider.instance.send(new TrialContainerTypeCreationFlowFailure(error.message));
            vscode.window.showErrorMessage(`Error with Trial Container Type creation Ux Flow: ${error}`);
            return;
        }

        // Try to get a working application from the Ux flow state provided
        let [app, shouldDelay]: [App | undefined, boolean] = [undefined, false];
        try {
            vscode.window.showInformationMessage(`Azure AD Application configuring starting...`);
            [app, shouldDelay] = await ctCreationState?.createGetOrImportApp();
            if (!app) {
                throw new Error("App is undefined");
            }
            // Consent app only if a local instance doesn't exist
            if (shouldDelay) {
                await new ProgressNotification().show();
                await app.consent();
            }
        } catch (error: any) {
            Account.onContainerTypeCreationFinish();
            DevelopmentTreeViewProvider.getInstance().refresh();
            console.error(`${error}`);
            TelemetryProvider.instance.send(new AppCreationFailure(error.message));
            vscode.window.showErrorMessage(`${error}`);
            return;
        }

        // We should have an app to query Container Types at this point -- use it to do a final check for existing Free CT
        try {
            freeCT = await account.getFreeContainerType(app.clientId);
        } catch (error: any) {
            Account.onContainerTypeCreationFinish();
            DevelopmentTreeViewProvider.getInstance().refresh();
            console.error(`Error fetching Free Trial Container Type: ${error}`);
            TelemetryProvider.instance.send(new TrialContainerTypeFetchFailure(error.message));
            vscode.window.showErrorMessage(`Error fetching Free Trial Container Type: ${error}`);
        }

        // If we have a Free CT we need to import it instead of creating a new one
        if (freeCT) {
            // If the owning app on the Free CT is not the app we have, we need to import the owning app
            if (freeCT.owningAppId !== app.clientId) {
                try {
                    ctCreationState = await new ContainerTypeCreationFlow(freeCT).run();
                    if (!ctCreationState) {
                        throw new Error("Ux Flow State is undefined");
                    }
                } catch (error: any) {
                    Account.onContainerTypeCreationFinish();
                    DevelopmentTreeViewProvider.getInstance().refresh();
                    console.error(`Error with Trial Container Type creation Ux Flow: ${error}`);
                    TelemetryProvider.instance.send(new TrialContainerTypeCreationFlowFailure(error.message));
                    vscode.window.showErrorMessage(`Error with Trial Container Type creation Ux Flow: ${error}`);
                    return;
                }

                try {
                    vscode.window.showInformationMessage(`Azure AD Application configuring starting...`);
                    [app, shouldDelay] = await ctCreationState?.createGetOrImportApp();
                    if (!app) {
                        throw new Error("App is undefined");
                    }
                    if (shouldDelay) {
                        await new ProgressNotification().show();
                        await app.consent();
                    }
                } catch (error: any) {
                    Account.onContainerTypeCreationFinish();
                    DevelopmentTreeViewProvider.getInstance().refresh();
                    console.error(`${error}`);
                    TelemetryProvider.instance.send(new AppImportFailure(error.message));
                    vscode.window.showErrorMessage(`${error}`);
                    return;
                }
            }

            try {
                freeCT = await account.importContainerType(freeCT, app);
                if (!freeCT) {
                    throw new Error("Free CT is undefined");
                }
            } catch (error: any) {
                Account.onContainerTypeCreationFinish();
                DevelopmentTreeViewProvider.getInstance().refresh();
                console.error(`Error importing Free Trial Container Type: ${error}`);
                TelemetryProvider.instance.send(new TrialContainerTypeImportFailure(error.message));
                vscode.window.showErrorMessage(`Error importing Free Trial Container Type: ${error}`);
                return;
            }

        } else {
            // If we don't have a Free CT, we need to create one
            try {
                vscode.window.showInformationMessage(`${ctCreationState.containerTypeName!} Container Type creation starting...`);
                freeCT = await account.createContainerType(app.clientId, ctCreationState.containerTypeName!, BillingClassification.FreeTrial);
                if (!freeCT) {
                    throw new Error("Free CT is undefined");
                }
            } catch (error: any) {
                if (error.name === 'TermsOfServiceError') {
                    vscode.window.showErrorMessage(error.message);
                    TelemetryProvider.instance.send(new TermsOfServiceAcceptedFailure(error.message));

                } else {
                    vscode.window.showErrorMessage("Unable to create Free Trial Container Type: " + error.message);
                    TelemetryProvider.instance.send(new TrialContainerTypeCreationFailure(error.message));
                }
                Account.onContainerTypeCreationFinish();
                DevelopmentTreeViewProvider.getInstance().refresh();
                return;
            }
        }

        // We should have a working app and a Free CT by this point -- now we register the CT on the owning tenant
        vscode.window.showInformationMessage(`Container Type Registration starting...`);
        try {
            await freeCT.addTenantRegistration(account.tenantId, app, ["full"], ["full"]);
        } catch (error: any) {
            vscode.window.showErrorMessage("Unable to register Free Trial Container Type, please re-try: " + error.message);
            TelemetryProvider.instance.send(new TrialContainerTypeRegistrationFailure(error.message));
            Account.onContainerTypeCreationFinish();
            DevelopmentTreeViewProvider.getInstance().refresh();
            return;
        }

        Account.onContainerTypeCreationFinish();
        DevelopmentTreeViewProvider.getInstance().refresh();
        vscode.window.showInformationMessage(`Container Type ${ctCreationState.containerTypeName} successfully created and registered on Azure AD App: ${app.displayName}`);
    }
}
