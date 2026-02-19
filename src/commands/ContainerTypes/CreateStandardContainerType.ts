/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../Command';
import { ContainerType } from '../../models/schemas';

// Static class that handles the create standard container type command
// TODO: Implement paid container type creation flow
export class CreatePaidContainerType extends Command {
    // Command name
    public static readonly COMMAND = 'ContainerTypes.createPaid';

    // Command handler
    public static async run(): Promise<ContainerType | undefined> {
        return undefined;
    }
}
