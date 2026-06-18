/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

/**
 * FileDecorationProvider that paints a warning tint on tree items whose
 * resourceUri carries this provider's scheme. Tree items opt in by setting
 * `resourceUri = BillingDecorationProvider.buildUri(id)`.
 */
export class BillingDecorationProvider implements vscode.FileDecorationProvider {
    public static readonly scheme = "spe-billing";
    private static _instance: BillingDecorationProvider | undefined;

    public static getInstance(): BillingDecorationProvider {
        if (!BillingDecorationProvider._instance) {
            BillingDecorationProvider._instance = new BillingDecorationProvider();
        }
        return BillingDecorationProvider._instance;
    }

    public static buildUri(id: string): vscode.Uri {
        return vscode.Uri.from({
            scheme: BillingDecorationProvider.scheme,
            path: `/${encodeURIComponent(id)}`,
            query: "billingInvalid=1"
        });
    }

    public provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        if (uri.scheme !== BillingDecorationProvider.scheme) {
            return undefined;
        }
        if (uri.query !== "billingInvalid=1") {
            return undefined;
        }
        return {
            color: new vscode.ThemeColor("list.warningForeground"),
            tooltip: vscode.l10n.t("Billing is not set up"),
            propagate: false
        };
    }
}

/**
 * Tints a tree row yellow (via FileDecorationProvider) — used on the
 * offending row only. Descendants are left untinted so the warning stays
 * localized to where the action is needed.
 */
export function tintBillingInvalid(item: vscode.TreeItem, uniqueId: string): void {
    item.resourceUri = BillingDecorationProvider.buildUri(uniqueId);
}

/**
 * Appends `-billingInvalid` to a tree item's contextValue so that menu
 * `when` clauses can hide commands that don't make sense without billing
 * (sample apps, postman collection, create container).
 */
export function blockBillingInvalid(item: vscode.TreeItem): void {
    const current = item.contextValue ?? "";
    if (current.includes("-billingInvalid")) {
        return;
    }
    item.contextValue = `${current}-billingInvalid`;
}
