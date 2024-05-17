/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { formatDistanceToNow, parseISO } from "date-fns";
import { window, QuickPickItem, QuickPickItemKind, ThemeIcon, Uri, QuickInputButtons, QuickInputButton } from "vscode";
import { Account } from "../../models/Account";
import { App } from "../../models/App";
import { ContainerType } from "../../models/ContainerType";



type UxInputStepResult = -1 | 0 | 1;
abstract class UxInputStep {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static readonly Back = -1;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static readonly Cancel = 0;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static readonly Next = 1;
    public abstract collectInput(state: UxFlowState): Promise<UxInputStepResult>;
}

abstract class LinearUxFlow { 
    protected state!: UxFlowState; 
    protected steps!: UxInputStep[];
    protected step: number = 0;

    private _nextStep(): void {
        this.step++;
        this.state.step++;
    }

    private _previousStep(): void {
        this.step--;
        this.state.step--;
    }

    public async run(): Promise<UxFlowState | undefined> {
        this.state.totalSteps = this.steps.length;
        while (this.step < this.steps.length) {
            if (this.step < 0) {
                throw new Error("Invalid step index: " + this.step);
            }
            let result = await this.steps[this.step].collectInput(this.state);
            if (result === -1) {
                this._previousStep();
            } else if (result === 0) {
                return undefined;
            } else {
                this._nextStep();
            }
        }
        return this.state;
    };
}

abstract class UxFlowState {
    public step!: number;
    public totalSteps?: number;
}

export class AppSelectionFlowState extends UxFlowState {
    public appId?: string;
    public appName?: string;
    public reconfigureApp?: boolean;

    public complete(): boolean {
        return this.appId !== undefined || this.appName !== undefined;
    }

    public shouldCreateNewApp(): boolean {
        return this.appId === 'new' && this.appName !== undefined;
    }

    // public async createGetOrImportApp(): Promise<[ App | undefined, boolean]> {
    //     if (!this.complete()) {
    //         return [undefined, false];
    //     }

    //     if (this.shouldCreateNewApp()) {
    //         return [await Account.get()!.createApp(this.appName!, true), true];
    //     } else if (Account.get()!.appIds.includes(this.appId!)) {
    //         return [Account.get()!.apps.find(app => app.clientId === this.appId), false];
    //     } else {
    //         return [await Account.get()!.importApp(this.appId!, true), true];
    //     }
    // }
}

export class AppSelectionFlow extends LinearUxFlow {
    public constructor() {
        super();
        this.state = new AppSelectionFlowState();
        this.state.step = 1;
        // this.steps = [
        //     new ImportOrCreateAppQuickPick()
        // ];
    }

    public async run(): Promise<AppSelectionFlowState> {
        return super.run() as Promise<AppSelectionFlowState>;
    }
}

export class ContainerTypeCreationFlowState extends AppSelectionFlowState {
    public containerTypeName?: string;
}

export class ContainerTypeCreationFlow extends LinearUxFlow {
    public constructor(freeCT?: ContainerType) {
        super();
        this.state = new ContainerTypeCreationFlowState();
        this.state.step = 1;
        if (freeCT) {
            (this.state as ContainerTypeCreationFlowState).appId = freeCT.owningAppId;
            this.steps = [
                //new ConfirmContainerTypeImport(freeCT),
                //new ImportOrCreateAppQuickPick(freeCT?.owningAppId)
            ];
        } else {
            this.steps = [
                //new ImportOrCreateAppQuickPick(),
                //new ContainerTypeDetailsInput()
            ];
        }
    }

    public async run(): Promise<ContainerTypeCreationFlowState> {
        return super.run() as Promise<ContainerTypeCreationFlowState>;
    }
}

export class AddGuestAppFlowState extends AppSelectionFlowState {
    public delegatedPerms: string[] = [];
    public applicationPerms: string[] = [];
}

export class AddGuestAppFlow extends LinearUxFlow {
    public constructor(private readonly _containerType: ContainerType) {
        super();
        this.state = new AddGuestAppFlowState();
        this.state.step = 1;
        this.steps = [
            new AddGuestAppPermissionsInput('Delegated'),
            new AddGuestAppPermissionsInput('Application')
        ];
    }

    public async run(): Promise<AddGuestAppFlowState> {
        return super.run() as Promise<AddGuestAppFlowState>;
    }
}

interface ApplicationPermissionOption extends QuickPickItem {
    value: string;
}

class AddGuestAppPermissionsInput extends UxInputStep {
    
    private readonly permChoices: ApplicationPermissionOption[] = [
        { label: "ReadContent", value: "readcontent", detail: "Read content within all storage containers" },
        { label: "WriteContent", value: "writecontent", detail: "Write content within all storage containers"  },
        { label: "Create", value: "create", detail: "Create storage containers"  },
        { label: "Delete", value: "delete", detail: "Delete storage containers"  },
        { label: "Read", value: "read", detail: "List storage containers and their properties"  },
        { label: "Write", value: "write", detail: "Update properties on storage containers"  },
        { label: "AddPermissions", value: "addpermissions", detail: "Add users and groups to permission roles on storage containers"  },
        { label: "UpdatePermissions", value: "updatepermissions", detail: "Update user and group permission roles on storage containers"  },
        { label: "DeletePermissions", value: "deletepermissions", detail: "Delete users and groups from permission roles on storage containers"  },
        { label: "DeleteOwnPermissions", value: "deleteownpermissions", detail: "Delete own app permission from all storage containers"  },
        { label: "ManagePermissions", value: "managepermissions", detail: "Manage permissions on all storage containers"  }
    ];
    private readonly fullPermChoiceValue = 'full';

    public constructor(private readonly _permissionType: 'Delegated' | 'Application') {
        super();
    }

    public collectInput(state: AddGuestAppFlowState): Promise<UxInputStepResult> {
        return new Promise<UxInputStepResult>((resolve, reject) => { 
            const qp = window.createQuickPick<ApplicationPermissionOption>();
            qp.title = `Select ${this._permissionType} Permissions`;
            qp.step = state.step;
            qp.totalSteps = state.totalSteps;
            qp.canSelectMany = true;
            qp.ignoreFocusOut = true;
            qp.placeholder = `Select one or more ${this._permissionType} permissions for your app`;
            qp.buttons = [...(state.totalSteps && state.totalSteps > 1 ? [QuickInputButtons.Back] : [])];
            qp.selectedItems = qp.items = this.permChoices;
            let selectedPerms: string[] = [];
            qp.onDidTriggerButton((button: QuickInputButton) => {
                if (button === QuickInputButtons.Back) {
                    qp.hide();
                    resolve(-1);
                }
            });
            qp.onDidAccept(() => {
                selectedPerms = [this.fullPermChoiceValue];
                if (qp.selectedItems.length !== this.permChoices.length) {
                    selectedPerms = qp.selectedItems.map(item => item.value);
                }
                if (selectedPerms.length === 0) {
                    return;
                }
                if (this._permissionType === 'Delegated') {
                    state.delegatedPerms = selectedPerms;
                } else {
                    state.applicationPerms = selectedPerms;
                }
                qp.hide();
                resolve(1);
            });
            qp.onDidHide(() => {
                qp.dispose();
                if (selectedPerms.length === 0) {
                    resolve(0);
                }
            });
            qp.show();
        });
    }

}

// class ImportOrCreateAppQuickPick extends UxInputStep {
//     private readonly defaultAppName = 'SharePoint Embedded App';
//     private readonly newApp: AppQuickPickItem = {
//         id: 'new',
//         label: `New Azure Application: ${this.defaultAppName}`,
//         detail: 'Creates a new Azure AD Application with the specified name',
//         name: this.defaultAppName,
//         alwaysShow: true,
//         iconPath: new ThemeIcon('new-app-icon')
//     };
//     private recentApps: AppQuickPickItem[] = [];
//     private readonly recentAppsSeparator: AppQuickPickItem = {
//         kind: QuickPickItemKind.Separator,
//         label: 'Your Recent Apps',
//         id: 'recent'
//     };
//     private azureApps: AppQuickPickItem[] = [];
//     private readonly azureAppsSeparator: AppQuickPickItem = {
//         kind: QuickPickItemKind.Separator,
//         label: 'Your Azure Apps',
//         id: 'all'
//     };

//     public constructor(private readonly _existingAppId?: string, private readonly _appExclusions?: Set<string>) {
//         super();
//     }

//     public async collectInput(state: AppSelectionFlowState): Promise<UxInputStepResult> {
//         const confirmAppImport = async (appId: string): Promise<boolean> => {
//             if (!Account.get()!.appIds.includes(appId!)) {
//                 const continueResult = "Continue";
//                 const result = await window.showInformationMessage(
//                     `The selected Azure with AppId: ${appId} app will need to be configured for use with this extension. This will create a new secret and certificate credential, add the Container.Selected permission role, and add a new redirect URI on it. Proceeding is not recommended on production applications.`, 
//                     continueResult, 
//                     "Cancel"
//                 );
//                 if (result !== continueResult) {
//                     return false;
//                 }
//             }
//             return true;
//         };

//         if (this._existingAppId) {
//             if (!(await confirmAppImport(this._existingAppId))) {
//                 return UxInputStep.Cancel;
//             }
//             state.reconfigureApp = true;
//             return UxInputStep.Next;
//         }

//         return new Promise<UxInputStepResult>((resolve, reject) => {
            
//             const qp = window.createQuickPick<AppQuickPickItem>();
//             qp.title = 'Create or Choose an Azure Application';
//             qp.step = state.step;
//             qp.totalSteps = state.totalSteps;
//             qp.placeholder = 'Enter a new app name or search for an existing app by name or Id';
//             qp.buttons = [...(state.totalSteps && state.totalSteps > 1 ? [QuickInputButtons.Back] : [])];
//             qp.onDidTriggerButton((button: QuickInputButton) => {
//                 if (button === QuickInputButtons.Back) {
//                     qp.hide();
//                     resolve(UxInputStep.Back);
//                 }
//             });
//             this.recentApps = [];/*Account.get()!.apps.map(app => (
//                 {
//                     id: app.clientId,
//                     label: app.displayName,
//                     detail: `Client ID: ${app.clientId}`,
//                     iconPath: new ThemeIcon('app-icon')
//                 }
//             ));*/
//             if (this._appExclusions) {
//                 this.recentApps = this.recentApps.filter(app => !this._appExclusions!.has(app.id));
//             }
//             const loadAzureApps = async (query?: string) => {
//                 qp.busy = true;
//                 const appData = await Account.get()!.searchApps(query, true);
//                 this.azureApps = appData.map(app => (
//                     { 
//                         id: app.appId,
//                         label: app.displayName,
//                         description:  `created ${formatDistanceToNow(parseISO(app.createdDateTime))} ago`,
//                         detail: `Client ID: ${app.appId}`,
//                         iconPath: new ThemeIcon('app-icon')
//                     }
//                 ));
//                 if (this._appExclusions) {
//                     this.azureApps = this.azureApps.filter(app => !this._appExclusions!.has(app.id));
//                 }
//                 updateDisplayedItems();
//                 qp.busy = false;
//             };

//             const updateDisplayedItems = () => {
//                 qp.items = qp.activeItems = [
//                     this.newApp,
//                     ...(this.recentApps.length > 0 ? [this.recentAppsSeparator, ...this.recentApps] : []),
//                     ...(this.azureApps.length > 0 ? [this.azureAppsSeparator, ...this.azureApps] : [])
//                 ];
//             };

//             qp.onDidChangeSelection(selectedItems => {
//                 state.appId = selectedItems[0].id;
//                 state.appName = selectedItems[0].name;
//                 qp.hide();
//             });

//             qp.onDidHide(async () => {
//                 qp.dispose();
//                 if (state.appId === undefined) {
//                     reject(UxInputStep.Cancel);
//                     return;
//                 }
//                 if (!state.shouldCreateNewApp()) {
//                     if (!(await confirmAppImport(state.appId!))) {
//                         reject(UxInputStep.Cancel);
//                         return;
//                     }
//                     state.reconfigureApp = true;
//                 }
//                 resolve(UxInputStep.Next);
//             });
    
//             const debounceDelayMs = 500;
//             let timeout: NodeJS.Timeout | undefined;
//             qp.onDidChangeValue(value => {
//                 qp.busy = true;
//                 this.newApp.name = value || this.defaultAppName;
//                 this.newApp.label = `New Azure AD Application: ${this.newApp.name}`;
//                 updateDisplayedItems();
//                 if (timeout) {
//                     clearTimeout(timeout);
//                 }
//                 timeout = setTimeout(async () => {
//                     await loadAzureApps(value);
//                 }, debounceDelayMs);
//             });

//             // Disable default filtering and sorting behavior on the quick pick
//             // https://github.com/microsoft/vscode/issues/73904#issuecomment-680298036
//             (qp as any).sortByLabel = false;
//             qp.matchOnDetail = false;
//             qp.matchOnDescription = false;

//             updateDisplayedItems();
//             loadAzureApps();
//             qp.show();
//         });
//     }
// }

// interface AppQuickPickItem extends QuickPickItem {
//     id: string;
//     name?: string;
// }

// class ConfirmContainerTypeImport extends UxInputStep {
    
//     public constructor(private readonly _containerType: ContainerType) {
//         super();
//     }
    
//     public async collectInput(state: UxFlowState): Promise<UxInputStepResult> {
//         const continueResult = "OK";
//         const result = await window.showInformationMessage(
//             `There is already a Free Trial Container Type on your tenant.\n\nContainerTypeId: ${this._containerType.containerTypeId}\nContainerTypeName: ${this._containerType.displayName}\nOwning AppId: ${this._containerType.owningAppId}\n\nDo you want to try importing it and its owning app into your workspace?`, 
//             continueResult, 
//             "Cancel"
//         );
//         if (result !== continueResult) {
//             return UxInputStep.Cancel;
//         }
//         return UxInputStep.Next;
//     }

// }

// export class ContainerTypeDetailsInput extends UxInputStep {
//     public async collectInput(state: ContainerTypeCreationFlowState): Promise<UxInputStepResult> {
//         return new Promise<UxInputStepResult>(async (resolve, reject) => {
//             const qp = window.createQuickPick();
//             qp.title = 'Free Trial Container Type Name:';
//             qp.value = 'SharePoint Embedded Free Trial Container Type';
//             qp.step = state.step;
//             qp.totalSteps = state.totalSteps;
//             qp.placeholder = 'Enter your Free Trial Container Type name';
//             qp.buttons = [...(state.totalSteps && state.totalSteps > 1 ? [QuickInputButtons.Back] : [])];
//             qp.onDidAccept(() => {
//                 if (!qp.value) {
//                     return;
//                 }
//                 state.containerTypeName = qp.value;
//                 qp.hide();
//                 resolve(UxInputStep.Next);
//             });
//             qp.onDidHide(() => {
//                 qp.dispose();
//                 if (!state.containerTypeName) {
//                     resolve(UxInputStep.Cancel);
//                 }
//             });
//             qp.show();
//         });
//     }
// }
