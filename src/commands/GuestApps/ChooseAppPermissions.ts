
import * as vscode from 'vscode';
import { Command } from "../Command";
import { ContainerType } from '../../models/ContainerType';
import { ApplicationPermissions } from '../../models/ApplicationPermissions';

interface ApplicationPermissionOption extends vscode.QuickPickItem {
    value: string;
}

export class SelectedAppPermissions {
    public delegatedPerms: string[] = [];
    public applicationPerms: string[] = [];
}

export class ChooseAppPermissions extends Command {
    
    public static async run(appPerms?: ApplicationPermissions): Promise<SelectedAppPermissions | undefined> {

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
        { label: "ReadContent", value: "readcontent", detail: "Read content within all storage containers" },
        { label: "WriteContent", value: "writecontent", detail: "Write content within all storage containers"  },
        { label: "Create", value: "create", detail: "Create storage containers"  },
        { label: "Delete", value: "delete", detail: "Delete storage containers"  },
        { label: "Read", value: "read", detail: "List storage containers and their properties"  },
        { label: "Write", value: "write", detail: "Update properties on storage containers"  },
        { label: "EnumeratePermissions", value: "enumeratepermissions", detail: "Can enumerate the members of a container and their roles."},
        { label: "AddPermissions", value: "addpermissions", detail: "Add users and groups to permission roles on storage containers"  },
        { label: "UpdatePermissions", value: "updatepermissions", detail: "Update user and group permission roles on storage containers"  },
        { label: "DeletePermissions", value: "deletepermissions", detail: "Delete users and groups from permission roles on storage containers"  },
        { label: "DeleteOwnPermission", value: "deleteownpermission", detail: "Delete own app permission from all storage containers"  },
        { label: "ManagePermissions", value: "managepermissions", detail: "Manage permissions on all storage containers"  }
    ];
    private static readonly _fullPermOption = 'full';

    public static async run(permType?: string, existingPerms?: string[]): Promise<string[] | undefined> {
        if (!permType) {
            return [];
        }
        const existingPermsChoices: ApplicationPermissionOption[] = ChooseAppPermission._permOptions.filter(choice => existingPerms?.includes(choice.label));
        return new Promise<string[] | undefined>((resolve, reject) => { 
            const qp = vscode.window.createQuickPick<ApplicationPermissionOption>();
            qp.title = `Select ${permType} Permissions`;
            qp.canSelectMany = true;
            qp.ignoreFocusOut = true;
            qp.placeholder = `Select one or more ${permType} permissions for your app`;
            qp.items = this._permOptions;
            qp.selectedItems = existingPerms ? existingPermsChoices : this._permOptions;
            let selectedPerms: string[] = [];
            qp.onDidAccept(() => {
                selectedPerms = [this._fullPermOption];
                if (qp.selectedItems.length !== this._permOptions.length) {
                    selectedPerms = qp.selectedItems.map(item => item.value);
                }
                if (selectedPerms.length === 0) {
                    return;
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