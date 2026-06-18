/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Prompts the user for a container type display name, enforcing the same
 * validation rules as the admin center: required, max 50 chars,
 * alphanumeric plus spaces, hyphens, and underscores.
 */
export async function promptForContainerTypeDisplayName(): Promise<string | undefined> {
    return vscode.window.showInputBox({
        placeHolder: vscode.l10n.t('Enter a display name for your new container type'),
        prompt: vscode.l10n.t('Container type display name'),
        validateInput: (value: string) => {
            const maxLength = 50;
            const alphanumericRegex = /^[a-zA-Z0-9\s\-_]+$/;
            if (!value) {
                return vscode.l10n.t('Display name cannot be empty');
            }
            if (value.length > maxLength) {
                return vscode.l10n.t('Display name must be no more than {0} characters long', maxLength);
            }
            if (!alphanumericRegex.test(value)) {
                return vscode.l10n.t('Display name must only contain alphanumeric characters');
            }
            return undefined;
        }
    });
}
