/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../../Command';
import * as vscode from 'vscode';
import { ContainerTypeTreeItem } from '../../../views/treeview/development/ContainerTypeTreeItem';
import { DevelopmentTreeViewProvider } from '../../../views/treeview/development/DevelopmentTreeViewProvider';
import { ProgressWaitNotification, Timer } from '../../../views/notifications/ProgressWaitNotification';
import { ContainerType } from '../../../models/ContainerType';
import { GetAccount } from '../../Accounts/GetAccount';

// Static class that handles the disable discoverability command
export class DisableContainerTypeDiscoverability extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.disableDiscoverability';

    // Command handler
    public static async run(commandProps?: DisableDiscoverabilityCommandProps): Promise<void> {
        if (!commandProps) {
            return;
        }

        const account = await GetAccount.run();
        if (!account) {
            return;
        }

        let containerType: ContainerType;
        if (commandProps instanceof ContainerTypeTreeItem) {
            containerType = commandProps.containerType;
        } else {
            containerType = commandProps;
        }
        if (!containerType) {
            return;
        }

        const message = `Are you sure you want to disable Discoverability on the '${containerType.name}' Container Type?`;
        const userChoice = await vscode.window.showInformationMessage(
            message,
            vscode.l10n.t('OK'), vscode.l10n.t('Cancel')
        );

        if (userChoice !== vscode.l10n.t('OK')) {
            return;
        }

        const progressWindow = new ProgressWaitNotification('Disabling container type discoverability (make take a minute)...');
        try {    
            progressWindow.show();
            const containerTypeProvider = account.containerTypeProvider;
            await containerTypeProvider.disableDiscoverability(containerType);
            const ctRefreshTimer = new Timer(60 * 1000);
            const refreshCt = async (): Promise<void> => {
                DevelopmentTreeViewProvider.instance.refresh();
                do {
                    const containerTypes = await containerTypeProvider.list();
                    if (containerTypes.find(ct => 
                        ct.id === containerType.id &&
                        ct.settings.isDiscoverabilityEnabled === true)
                    ) {
                        DevelopmentTreeViewProvider.instance.refresh();
                        break;
                    }
                    // sleep for 5 seconds
                    await new Promise(r => setTimeout(r, 5000));
                } while (!ctRefreshTimer.finished);
                progressWindow.hide();
            };
            refreshCt();
        } catch (error: any) {
            progressWindow.hide();
            const message = vscode.l10n.t('Unable to disable container type discoverability: {0}', error);
            vscode.window.showErrorMessage(message);
        }
    }
}

export type DisableDiscoverabilityCommandProps = ContainerTypeTreeItem | ContainerType;
