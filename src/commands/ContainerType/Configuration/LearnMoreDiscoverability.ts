
//App.viewInAzure

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../../Command';

export class LearnMoreDiscoverability extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerType.learnMoreDiscoverability';

    // Command handler
    public static async run(): Promise<void> {
        const learnMoreUrl = 'https://learn.microsoft.com/sharepoint/dev/embedded/concepts/content-experiences/user-experiences-overview#content-discovery-in-microsoft-365';
        vscode.env.openExternal(vscode.Uri.parse(learnMoreUrl));
    };
}

