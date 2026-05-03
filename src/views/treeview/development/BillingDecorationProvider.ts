/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

/**
 * FileDecorationProvider that paints a "!" badge and a warning tint on
 * tree items whose resourceUri carries this provider's scheme. Tree items
 * opt in by setting `resourceUri = BillingDecorationProvider.buildUri(id)`.
 *
 * VS Code allows only one `iconPath` per TreeItem, so this provider is the
 * only way to render a second visible indicator (the badge, in the row's
 * right gutter) alongside the existing container/registration icon.
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
        // Only the row that triggered the warning gets the "!" badge — sub-rows
        // get the yellow tint (via the color) but no badge, to avoid stamping
        // every descendant in the tree with the same exclamation mark.
        const isBadgeRow = uri.fragment === "badge";
        return {
            badge: isBadgeRow ? "!" : undefined,
            color: new vscode.ThemeColor("list.warningForeground"),
            tooltip: vscode.l10n.t("Billing is not set up"),
            propagate: false
        };
    }
}

/**
 * Tints a tree row yellow (via FileDecorationProvider) without showing a "!"
 * badge — used to color descendants of a billing-invalid container type.
 */
export function tintBillingInvalid(item: vscode.TreeItem, uniqueId: string): void {
    item.resourceUri = BillingDecorationProvider.buildUri(uniqueId);
}

/**
 * Same as `tintBillingInvalid` but additionally renders the "!" badge — used
 * on the actual offending rows (the container type and its registration).
 */
export function badgeBillingInvalid(item: vscode.TreeItem, uniqueId: string): void {
    item.resourceUri = vscode.Uri.from({
        scheme: BillingDecorationProvider.scheme,
        path: `/${encodeURIComponent(uniqueId)}`,
        query: "billingInvalid=1",
        fragment: "badge"
    });
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
