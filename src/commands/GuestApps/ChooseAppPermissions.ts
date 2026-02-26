/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from "../Command";

interface ApplicationPermissionOption extends vscode.QuickPickItem {
    value: string;
}

export class SelectedAppPermissions {
    public delegatedPerms: string[] = [];
    public applicationPerms: string[] = [];
}

export interface PermissionInput {
    delegated?: string[];
    appOnly?: string[];
}

export class ChooseAppPermissions extends Command {

    public static async run(appPerms?: PermissionInput): Promise<SelectedAppPermissions | undefined> {

        const existingDelegatedPerms = appPerms?.delegated;
        const existingAppPerms = appPerms?.appOnly;

        const delegated = await ChooseAppPermission.run('Delegated', existingDelegatedPerms);
        if (!delegated) {
            return;
        }
        const appOnly = await ChooseAppPermission.run('Application', existingAppPerms);
        if (!appOnly) {
            return;
        }
        return {
            delegatedPerms: delegated,
            applicationPerms: appOnly,
        } as SelectedAppPermissions;
    }
}

class ChooseAppPermission extends Command {

    private static readonly _permOptions: ApplicationPermissionOption[] = [
        { label: "None", value: "none", detail: vscode.l10n.t("No permissions") },
        { label: "ReadContent", value: "readContent", detail: vscode.l10n.t("Read content within all storage containers") },
        { label: "WriteContent", value: "writeContent", detail: vscode.l10n.t("Write content within all storage containers")  },
        { label: "Create", value: "create", detail: vscode.l10n.t("Create storage containers")  },
        { label: "Delete", value: "delete", detail: vscode.l10n.t("Delete storage containers")  },
        { label: "Read", value: "read", detail: vscode.l10n.t("List storage containers and their properties")  },
        { label: "Write", value: "write", detail: vscode.l10n.t("Update properties on storage containers")  },
        { label: "EnumeratePermissions", value: "enumeratePermissions", detail: vscode.l10n.t("Can enumerate the members of a container and their roles.") },
        { label: "AddPermissions", value: "addPermissions", detail: vscode.l10n.t("Add users and groups to permission roles on storage containers")  },
        { label: "UpdatePermissions", value: "updatePermissions", detail: vscode.l10n.t("Update user and group permission roles on storage containers")  },
        { label: "DeletePermissions", value: "deletePermissions", detail: vscode.l10n.t("Delete users and groups from permission roles on storage containers")  },
        { label: "DeleteOwnPermission", value: "deleteOwnPermission", detail: vscode.l10n.t("Delete own app permission from all storage containers")  },
        { label: "ManagePermissions", value: "managePermissions", detail: vscode.l10n.t("Manage permissions on all storage containers")  }
    ];
    private static readonly _noneOption = 'none';
    private static readonly _fullPermOption = 'full';

    // Graph API normalizes permissions by removing children when a parent is present.
    // Expand parent permissions back to their children for accurate pre-selection in the UI.
    private static readonly _permissionHierarchy: Record<string, string[]> = {
        'managePermissions': ['enumeratePermissions', 'addPermissions', 'updatePermissions', 'deletePermissions', 'deleteOwnPermission'],
        'manageContent': ['readContent', 'writeContent'],
    };

    private static _expandPermissions(perms: string[]): string[] {
        const expanded = new Set(perms);
        for (const perm of perms) {
            const children = this._permissionHierarchy[perm];
            if (children) {
                children.forEach(child => expanded.add(child));
            }
        }
        return [...expanded];
    }

    public static async run(permType?: string, existingPerms?: string[]): Promise<string[] | undefined> {
        if (!permType) {
            return [];
        }
        // If existing perms include 'full', select all options
        const isFull = existingPerms?.includes(this._fullPermOption);
        // Expand parent permissions so children are pre-selected in the UI
        const expandedPerms = existingPerms ? this._expandPermissions(existingPerms) : existingPerms;
        const existingPermsChoices: ApplicationPermissionOption[] = isFull
            ? this._permOptions
            : this._permOptions.filter(choice =>
                expandedPerms?.includes(choice.label) || expandedPerms?.includes(choice.value)
            );
        return new Promise<string[] | undefined>((resolve, reject) => {
            const qp = vscode.window.createQuickPick<ApplicationPermissionOption>();
            const title = vscode.l10n.t('Select {0} Permissions', permType);
            const placeholder = vscode.l10n.t('Select one or more {0} permissions for your app', permType);
            qp.title = title;
            qp.canSelectMany = true;
            qp.ignoreFocusOut = true;
            qp.placeholder = placeholder;
            // Exclude "None" from the selectable permission options
            const selectableOptions = this._permOptions.filter(o => o.value !== this._noneOption);
            qp.items = selectableOptions;
            qp.selectedItems = existingPerms && !existingPerms.includes(this._noneOption)
                ? existingPermsChoices.filter(o => o.value !== this._noneOption)
                : existingPerms ? [] : selectableOptions;
            let selectedPerms: string[] = [];
            qp.onDidAccept(() => {
                if (qp.selectedItems.length === 0) {
                    // No permissions selected → "none"
                    selectedPerms = [this._noneOption];
                } else if (qp.selectedItems.length === selectableOptions.length) {
                    // All permissions selected → "full"
                    selectedPerms = [this._fullPermOption];
                } else {
                    selectedPerms = qp.selectedItems.map(item => item.value);
                }
                qp.hide();
                resolve(selectedPerms);
            });
            qp.onDidHide(() => {
                qp.dispose();
                if (selectedPerms.length === 0) {
                    resolve(undefined);
                }
            });
            qp.show();
        });
    }

}