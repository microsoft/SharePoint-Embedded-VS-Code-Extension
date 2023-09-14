/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ExtensionContext, LogOutputChannel } from "vscode";

export namespace ext {
    export let context: ExtensionContext;
    export let outputChannel: LogOutputChannel;
}
