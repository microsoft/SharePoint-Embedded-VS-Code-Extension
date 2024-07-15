/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { Account } from '../../models/Account';

export class GetAccount extends Command {
    // Command name
    public static readonly COMMAND = 'Accounts.getAccount';

    // Command handler
    public static async run(): Promise<Account | undefined> {
        const account = Account.get();
        if (!account) {
            vscode.window.showErrorMessage(vscode.l10n.t('Please sign in first.'));
            return;
        }
        return account;
    }
}
