
import { formatDistanceToNow, parseISO } from "date-fns";
import { window, QuickPickItem, QuickPickItemKind, ThemeIcon, Uri, QuickInputButtons, QuickInputButton } from "vscode";
import { Account } from "../models/Account";



type UxInputStepResult = -1 | 0 | 1; // -1 = back, 0 = cancel, 1 = next
abstract class UxInputStep {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static readonly BackEvent = 'back';
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static readonly CancelEvent = 'cancel';
    public abstract collectInput(state: UxFlowState): Promise<UxInputStepResult>;
}

abstract class LinearUxFlow { 
    protected state!: UxFlowState; 
    protected steps!: UxInputStep[];
    protected step: number = 0;

    private nextStep(): void {
        this.step++;
        this.state.step++;
    }

    private previousStep(): void {
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
                this.previousStep();
            } else if (result === 0) {
                return undefined;
            } else {
                this.nextStep();
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
    public shouldCreateNewApp(): boolean {
        return this.appId === 'new' && this.appName !== undefined;
    }
}

export class AppSelectionFlow extends LinearUxFlow {
    public constructor() {
        super();
        this.state = new AppSelectionFlowState();
        this.state.step = 1;
        this.steps = [
            new ImportOrCreateAppQuickPick()
        ];
    }

    public async run(): Promise<AppSelectionFlowState> {
        return super.run() as Promise<AppSelectionFlowState>;
    }
}

export class ContainerTypeCreationFlowState extends AppSelectionFlowState {
    public containerTypeName?: string;
}

export class ContainerTypeCreationFlow extends LinearUxFlow {
    public constructor() {
        super();
        this.state = new ContainerTypeCreationFlowState();
        this.state.step = 1;
        this.steps = [
            new ImportOrCreateAppQuickPick(),
            new ContainerTypeDetailsInput()
        ];
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
    public constructor() {
        super();
        this.state = new AddGuestAppFlowState();
        this.state.step = 1;
        this.steps = [
            new ImportOrCreateAppQuickPick(),
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
        { label: "Read", value: "read", detail: "List storage containers"  },
        { label: "Write", value: "write", detail: "Update properties on storage containers"  },
        { label: "AddPermissions", value: "addpermissions", detail: "Add users and groups to permission roles on storage containers"  },
        { label: "UpdatePermissions", value: "updatepermissions", detail: "Update user and group permission roles on storage containers"  },
        { label: "DeletePermissions", value: "deletepermissions", detail: "Delete users and groups from permission roles on storage containers"  },
        { label: "DeleteOwnPermissions", value: "deleteownpermissions", detail: "TODO: What is this one?"  },
        { label: "ManagePermissions", value: "managepermissions", detail: "Manage all permissions on storage containers"  }
    ];
    private readonly fullPermChoiceValue = 'full';

    public constructor(private readonly permissionType: 'Delegated' | 'Application') {
        super();
    }

    public collectInput(state: AddGuestAppFlowState): Promise<UxInputStepResult> {
        return new Promise<UxInputStepResult>((resolve, reject) => { 
            const qp = window.createQuickPick<ApplicationPermissionOption>();
            qp.title = `Select ${this.permissionType} Permissions`;
            qp.step = state.step;
            qp.totalSteps = state.totalSteps;
            qp.canSelectMany = true;
            qp.ignoreFocusOut = true;
            qp.placeholder = `Select one or more ${this.permissionType} permissions for your app`;
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
                if (this.permissionType === 'Delegated') {
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

class ImportOrCreateAppQuickPick extends UxInputStep {
    private readonly defaultAppName = 'SharePoint Embedded App';
    private readonly newApp: AppQuickPickItem = {
        id: 'new',
        label: `New Azure Application: ${this.defaultAppName}`,
        detail: 'Creates a new Azure AD Application with the specified name',
        name: this.defaultAppName,
        alwaysShow: true,
        iconPath: new ThemeIcon('add')
    };
    private recentApps: AppQuickPickItem[] = [];
    private readonly recentAppsSeparator: AppQuickPickItem = {
        kind: QuickPickItemKind.Separator,
        label: 'Your Recent Apps',
        id: 'recent'
    };
    private azureApps: AppQuickPickItem[] = [];
    private readonly azureAppsSeparator: AppQuickPickItem = {
        kind: QuickPickItemKind.Separator,
        label: 'Your Azure Apps',
        id: 'all'
    };

    public async collectInput(state: AppSelectionFlowState): Promise<UxInputStepResult> {
        return new Promise<UxInputStepResult>((resolve, reject) => {       
            const qp = window.createQuickPick<AppQuickPickItem>();
            qp.title = 'Create or Choose an Azure Application';
            qp.step = state.step;
            qp.totalSteps = state.totalSteps;
            qp.placeholder = 'Enter a new app name or search for an existing app by name or Id';
            qp.buttons = [...(state.totalSteps && state.totalSteps > 1 ? [QuickInputButtons.Back] : [])];
            qp.onDidTriggerButton((button: QuickInputButton) => {
                if (button === QuickInputButtons.Back) {
                    qp.hide();
                    resolve(-1);
                }
            });
            this.recentApps = Account.get()!.apps.map(app => (
                {
                    id: app.clientId,
                    label: app.displayName,
                    detail: `Client ID: ${app.clientId}`,
                    iconPath: new ThemeIcon('extensions-view-icon')
                }
            ));
            const loadAzureApps = async (query?: string) => {
                qp.busy = true;
                const appData = await Account.get()!.searchApps(query, true);
                this.azureApps = appData.map(app => (
                    { 
                        id: app.appId,
                        label: app.displayName,
                        description:  `created ${formatDistanceToNow(parseISO(app.createdDateTime))} ago`,
                        detail: `Client ID: ${app.appId}`,
                        iconPath: new ThemeIcon('extensions-view-icon')
                    }
                ));
                updateDisplayedItems();
                qp.busy = false;
            };

            const updateDisplayedItems = () => {
                qp.items = qp.activeItems = [
                    this.newApp,
                    ...(this.recentApps.length > 0 ? [this.recentAppsSeparator, ...this.recentApps] : []),
                    ...(this.azureApps.length > 0 ? [this.azureAppsSeparator, ...this.azureApps] : [])
                ];
            };
            
            qp.onDidChangeSelection(selectedItems => {
                state.appId = selectedItems[0].id;
                state.appName = selectedItems[0].name;
                qp.hide();
            });

            qp.onDidHide(async () => {
                qp.dispose();
                if (state.appId === undefined) {
                    reject(0);
                    return;
                }
                if (!state.shouldCreateNewApp()) {
                    if (!Account.get()!.appIds.includes(state.appId!)) {
                        const continueResult = "Continue";
                        const result = await window.showInformationMessage(
                            "The selected Azure app will need to be configured for use with this extension. This will create a new secret and certificate credential, add the Container.Selected permission role, and add a new redirect URI on it. Proceeding is not recommended on production applications.", 
                            continueResult, 
                            "Cancel"
                        );
                        if (result !== continueResult) {
                            reject(0);
                            return;
                        }
                        state.reconfigureApp = true;
                    }
                }
                resolve(1);
            });
    
            const debounceDelayMs = 500;
            let timeout: NodeJS.Timeout | undefined;
            qp.onDidChangeValue(value => {
                qp.busy = true;
                this.newApp.name = value || this.defaultAppName;
                this.newApp.label = `New Azure AD Application: ${this.newApp.name}`;
                updateDisplayedItems();
                if (timeout) {
                    clearTimeout(timeout);
                }
                timeout = setTimeout(async () => {
                    await loadAzureApps(value);
                }, debounceDelayMs);
            });

            // Disable default filtering and sorting behavior on the quick pick
            // https://github.com/microsoft/vscode/issues/73904#issuecomment-680298036
            (qp as any).sortByLabel = false;
            qp.matchOnDetail = false;
            qp.matchOnDescription = false;

            updateDisplayedItems();
            loadAzureApps();
            qp.show();
        });
    }
}

interface AppQuickPickItem extends QuickPickItem {
    id: string;
    name?: string;
}

export class ContainerTypeDetailsInput extends UxInputStep {
    public async collectInput(state: ContainerTypeCreationFlowState): Promise<UxInputStepResult> {
        return new Promise<UxInputStepResult>(async (resolve, reject) => {
            const containerTypeName = await window.showInputBox({
                prompt: 'Free Trial Container Type Name:',
                value: 'Free Trial Container Type'
            });
            if (containerTypeName === undefined) {
                reject(0);
                return;
            }
            state.containerTypeName = containerTypeName;
            resolve(1);
        });
    }
}
