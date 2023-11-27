
import { formatDistanceToNow, parseISO } from "date-fns";
import { window, QuickPickItem, QuickPickItemKind, ThemeIcon, Uri } from "vscode";
import { Account } from "../models/Account";

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
        while (this.step < this.steps.length) {
            if (this.step < 0) {
                throw new Error("Invalid step index: " + this.step);
            }
            let result = await this.steps[this.step].collectInput(this.state);
            if (result === -1) {
                this.previousStep();
            } else if (result === 0) {
                return undefined;
            }
            this.nextStep();
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

type UxInputStepResult = -1 | 0 | 1; // -1 = back, 0 = cancel, 1 = next
abstract class UxInputStep {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static readonly BackEvent = 'back';
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static readonly CancelEvent = 'cancel';
    public abstract collectInput(state: UxFlowState): Promise<UxInputStepResult>;
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
        const qp = window.createQuickPick<AppQuickPickItem>();
        return new Promise<UxInputStepResult>((resolve, reject) => {
            qp.title = 'Create or Choose an Azure Application';
            qp.placeholder = 'Enter a new app name or search for an existing app by name or Id';
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
