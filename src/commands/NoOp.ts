/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from './Command';

// Static class that handles the sign in command
export class NoOp extends Command {
    // Command name
    public static readonly COMMAND = 'noOp';

    // Command handler
    public static async run(): Promise<void> {
        console.log('NoOp command executed.');
    }
}
