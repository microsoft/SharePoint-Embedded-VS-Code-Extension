/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import * as Graph from '@microsoft/microsoft-graph-client';
import { Application, ContainerType, ContainerTypeRegistration, ContainerTypeRegistrationCreate, guidSchema } from '../../models/schemas';
import type { SelectedEntraApp } from '../Apps/GetOrCreateApp';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { ContainerTypeRegistrationService } from '../../services/Graph/ContainerTypeRegistrationService';
import { AppAuthProviderFactory } from '../../services/Auth/AppAuthProviderFactory';
import { AuthenticationState, type AuthenticatedAccount } from '../../services/AuthenticationState';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { AdminConsentHelper } from '../../utils/AdminConsentHelper';
import { clientId } from '../../client';
import { REQUIRED_DELEGATED_PERMISSIONS } from '../../utils/ExtensionAppPermissions';
import { openStorageExplorerWhenReady } from './StorageExplorerHandoff';
import { StorageExplorerTreeItem } from '../../views/treeview/development/StorageExplorerTreeItem';

/**
 * Command to register a container type on the local tenant
 *
 * Registration Flow:
 * 1. Validate authentication and get container type
 * 2. Check if already registered
 * 3. Configure a local owning application, or resolve the foreign app's local service principal
 * 4. Ask whether to include a grant for the extension
 * 5. Register using the signed-in tenant and the container type's recorded owner
 * 6. Verify registration completes
 */
export class RegisterOnLocalTenant extends Command {
    public static readonly COMMAND = 'ContainerType.registerOnLocalTenant';

    // ========================================================================
    // TOGGLE: Registration Auth Context
    // ========================================================================
    // true  = Use the 1P extension app's auth context (GraphProvider.registrations)
    // false = Use the owning app's auth context (AppAuthProviderFactory)
    // ========================================================================
    private static readonly USE_EXTENSION_APP_AUTH = true;

    // Configuration constants
    private static readonly BROKER_REDIRECT_URI_TEMPLATE = 'ms-appx-web://Microsoft.AAD.BrokerPlugin/{appId}';
    private static readonly CONSENT_REDIRECT_URI = 'http://localhost/redirect';
    private static readonly IDENTIFIER_URI_TEMPLATE = 'api://{appId}';
    private static readonly MAX_PROPAGATION_WAIT_MS = 60000; // 60 seconds
    private static readonly POLL_INTERVAL_MS = 3000; // 3 seconds
    private static readonly REGISTRATION_GUIDE_URL = 'https://learn.microsoft.com/en-us/sharepoint/dev/embedded/concepts/app-concepts/register-api-documentation';

    public static async offerRegistrationAfterCreate(
        containerType: ContainerType,
        owner: SelectedEntraApp,
        localPrompt: string,
        creationTenantId?: string
    ): Promise<void> {
        let prompt = localPrompt;
        let register = vscode.l10n.t('Register on local tenant');
        if (owner.isCrossTenant) {
            const tenant = guidSchema.safeParse(creationTenantId);
            if (!tenant.success) {
                RegisterOnLocalTenant.showRegistrationFailure(containerType, vscode.l10n.t('Could not determine which tenant the container type was created in.'));
                return;
            }
            prompt = vscode.l10n.t('Container type "{0}" was created. Register it in tenant {1}?', containerType.name, tenant.data);
            register = vscode.l10n.t('Register in this tenant');
        }

        const skip = vscode.l10n.t('Skip');
        const selection = await vscode.window.showInformationMessage(prompt, register, skip);
        if (selection === register) {
            await RegisterOnLocalTenant.registerInTenant(containerType, creationTenantId);
        }
    }

    private static showRegistrationFailure(containerType: ContainerType, reason: string, offerGuide = false): void {
        const message = vscode.l10n.t(
            'Registration failed for container type "{0}": {1} To retry without recreating it, right-click the container type and select Register on local tenant.',
            containerType.name, reason
        );
        if (!offerGuide) {
            void vscode.window.showErrorMessage(message);
            return;
        }

        const openGuide = vscode.l10n.t('Open registration guide');
        // A dismissed or unattended toast must not block a context-menu retry.
        void vscode.window.showErrorMessage(message, openGuide).then(async choice => {
            if (choice === openGuide) {
                await RegisterOnLocalTenant.openRegistrationGuide();
            }
        });
    }

    private static async openRegistrationGuide(): Promise<void> {
        const guideUrl = RegisterOnLocalTenant.REGISTRATION_GUIDE_URL;
        try {
            if (await vscode.env.openExternal(vscode.Uri.parse(guideUrl))) {
                return;
            }
        } catch (error) {
            console.error('[RegisterOnLocalTenant] Failed to open registration guide:', error);
        }
        void vscode.window.showErrorMessage(vscode.l10n.t('Could not open the registration guide. Visit {0}.', guideUrl));
    }

    private static readonly pendingRegistrations = new Set<string>();

    public static run(commandProps?: RegistrationCommandProps): Promise<ContainerTypeRegistration | undefined> {
        return RegisterOnLocalTenant.registerInTenant(commandProps);
    }

    private static async registerInTenant(
        commandProps?: RegistrationCommandProps,
        expectedTenantId?: string
    ): Promise<ContainerTypeRegistration | undefined> {
        const validationResult = await RegisterOnLocalTenant.validateAndGetContainerType(commandProps);
        if (!validationResult) {
            return undefined;
        }
        const { account, graphProvider, containerType } = validationResult;
        const tenantId = account.tenantId.toLowerCase();
        if (expectedTenantId && tenantId !== expectedTenantId.toLowerCase()) {
            RegisterOnLocalTenant.showRegistrationFailure(containerType, vscode.l10n.t('Sign in to tenant {0} before registering this container type.', expectedTenantId));
            return undefined;
        }

        // Both the creation prompt and the tree can invoke registration for the same container type.
        const key = `${tenantId}:${containerType.id}`;
        if (RegisterOnLocalTenant.pendingRegistrations.has(key)) {
            void vscode.window.showInformationMessage(vscode.l10n.t('Registration is already in progress for "{0}".', containerType.name));
            return undefined;
        }
        RegisterOnLocalTenant.pendingRegistrations.add(key);
        try {
            if (await RegisterOnLocalTenant.hasExistingRegistration(graphProvider.registrations, containerType)) {
                return undefined;
            }

            const owningApp = await RegisterOnLocalTenant.getOwningApplication(graphProvider, containerType, account.tenantId);
            if (!owningApp) {
                return undefined;
            }
            // Only home-tenant application objects can be configured here. For a foreign
            // owner, use its existing enterprise application and let Graph authorize the write.
            if (owningApp !== 'crossTenant' && !await RegisterOnLocalTenant.configureApplication(
                graphProvider, containerType, owningApp, account.tenantId
            )) {
                return undefined;
            }

            const grantButton = vscode.l10n.t('Grant extension permissions');
            const skipButton = vscode.l10n.t('Skip');
            const extensionChoice = await vscode.window.showInformationMessage(
                vscode.l10n.t('Grant the SharePoint Embedded extension permissions to perform container operations on this container type?'),
                grantButton,
                skipButton
            );

            const registrationService = RegisterOnLocalTenant.USE_EXTENSION_APP_AUTH
                ? graphProvider.registrations
                : await RegisterOnLocalTenant.getOwningAppToken(containerType, account);
            if (!registrationService) {
                return undefined;
            }

            // PUT can replace existing grants. Check again after the user prompt, then
            // make sure the active tenant hasn't changed while the command was awaiting input.
            if (await RegisterOnLocalTenant.hasExistingRegistration(registrationService, containerType)) {
                return undefined;
            }
            const currentAccount = await AuthenticationState.getCurrentAccount();
            if (currentAccount?.tenantId.toLowerCase() !== tenantId) {
                RegisterOnLocalTenant.showRegistrationFailure(containerType, vscode.l10n.t('Sign in to tenant {0} before registering this container type.', account.tenantId));
                return undefined;
            }
            return await RegisterOnLocalTenant.registerContainerType(containerType, registrationService, extensionChoice === grantButton);
        } catch (error) {
            RegisterOnLocalTenant.handleRegistrationError(containerType, error);
            return undefined;
        } finally {
            RegisterOnLocalTenant.pendingRegistrations.delete(key);
        }
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    /**
     * Validate authentication and extract container type from command props
     */
    private static async validateAndGetContainerType(
        commandProps?: RegistrationCommandProps
    ): Promise<{ account: AuthenticatedAccount; graphProvider: GraphProvider; containerType: ContainerType } | undefined> {

        const containerType = commandProps instanceof ContainerTypeTreeItem || commandProps instanceof StorageExplorerTreeItem
            ? commandProps.containerType
            : commandProps;
        if (!containerType?.id || !containerType.owningAppId) {
            void vscode.window.showErrorMessage(vscode.l10n.t('Registration failed: No valid container type was provided.'));
            return undefined;
        }

        if (!(await AuthenticationState.isSignedIn())) {
            RegisterOnLocalTenant.showRegistrationFailure(containerType, vscode.l10n.t('Sign in to register container types.'));
            return undefined;
        }
        const account = await AuthenticationState.getCurrentAccount();
        if (!account || !guidSchema.safeParse(account.tenantId).success) {
            RegisterOnLocalTenant.showRegistrationFailure(containerType, vscode.l10n.t('Could not determine the signed-in tenant. Sign in again.'));
            return undefined;
        }

        return { account, graphProvider: GraphProvider.getInstance(), containerType };
    }

    private static async hasExistingRegistration(
        registrationService: ContainerTypeRegistrationService,
        containerType: ContainerType
    ): Promise<boolean> {
        // The service returns null only for not found. Any other lookup failure must
        // stop registration so a failed read cannot lead to overwriting existing grants.
        if (!await registrationService.get(containerType.id)) {
            return false;
        }
        void vscode.window.showInformationMessage(vscode.l10n.t('Already registered: "{0}" is registered in this tenant.', containerType.name));
        DevelopmentTreeViewProvider.instance.refresh();
        return true;
    }

    private static async getOwningApplication(
        graphProvider: GraphProvider,
        containerType: ContainerType,
        tenantId: string
    ): Promise<Application | 'crossTenant' | undefined> {
        const app = await graphProvider.applications.get(containerType.owningAppId, { useAppId: true });
        if (app) {
            return app;
        }

        // A foreign owning app has a service principal here, not a local app registration.
        try {
            const principal = await graphProvider.applications.getServicePrincipal(containerType.owningAppId);
            const ownerTenant = guidSchema.safeParse(principal.appOwnerOrganizationId);
            if (principal.servicePrincipalType === 'Application' && ownerTenant.success &&
                ownerTenant.data.toLowerCase() !== tenantId.toLowerCase() &&
                principal.appId?.toLowerCase() === containerType.owningAppId.toLowerCase()) {
                if (principal.accountEnabled === false) {
                    RegisterOnLocalTenant.showRegistrationFailure(containerType, vscode.l10n.t('The owning enterprise application is disabled in this tenant. Ask your tenant administrator to enable it.'), true);
                    return undefined;
                }
                return 'crossTenant';
            }
        } catch (error) {
            if (getGraphStatus(error) !== 404) {
                throw error;
            }
        }
        RegisterOnLocalTenant.showRegistrationFailure(containerType, vscode.l10n.t('No eligible owning enterprise application was found in this tenant. Work with the app owner and your tenant administrator to add the owning application.'), true);
        return undefined;
    }

    /**
     * Configure application for container type registration
     * This includes: public client flow, URIs, permissions, and admin consent
     */
    private static async configureApplication(
        graphProvider: GraphProvider,
        containerType: ContainerType,
        owningApp: any,
        tenantId: string
    ): Promise<boolean> {

        const progress = new ProgressWaitNotification(
            vscode.l10n.t('Configuring application for registration...')
        );
        progress.show();

        try {
            // Step 1: Enable public client flow (required for broker auth)
            await RegisterOnLocalTenant.ensurePublicClientFlow(graphProvider, containerType, owningApp);

            // Step 2: Configure and verify identifier URI
            await RegisterOnLocalTenant.ensureIdentifierUri(graphProvider, containerType, owningApp);

            // Step 3: Configure and verify redirect URIs
            await RegisterOnLocalTenant.ensureRedirectUris(graphProvider, containerType, owningApp);

            // Step 4: Configure and verify permissions
            const permissionsAdded = await RegisterOnLocalTenant.ensurePermissions(graphProvider, containerType, owningApp);

            progress.hide();

            // ========================================================================
            // TOGGLE: Explicit Admin Consent Flow
            // ========================================================================
            // Uncomment this section to enable explicit admin consent prompt
            // Comment out to rely on VS Code's automatic consent during token acquisition
            //
            // NOTE: When using OPTION B (automatic consent), the propagation wait
            // happens in getOwningAppToken() after token acquisition to ensure
            // permissions are ready before attempting registration.
            // ========================================================================

            // OPTION A: Explicit consent (uncomment to enable)
            // const consentGranted = await RegisterOnLocalTenant.requestAdminConsent(
            //     containerType,
            //     tenantId,
            //     permissionsAdded
            // );
            // return consentGranted;

            // OPTION B: Skip explicit consent, VS Code handles it automatically (default)
            return true; // Continue to token acquisition - VS Code will prompt for consent if needed

            // ========================================================================

        } catch (error: any) {
            progress.hide();
            console.error('[RegisterOnLocalTenant] App configuration failed:', error);

            const continueAnyway = 'Continue Anyway';
            const choice = await vscode.window.showWarningMessage(
                vscode.l10n.t('Failed to configure app: {0}. Continue with registration?', error.message || error),
                { modal: true },
                continueAnyway
            );

            return choice === continueAnyway;
        }
    }

    /**
     * Ensure public client flow is enabled (required for Windows broker authentication)
     */
    private static async ensurePublicClientFlow(
        graphProvider: GraphProvider,
        containerType: ContainerType,
        owningApp: any
    ): Promise<void> {

        if (owningApp.isFallbackPublicClient) {
            console.log('[RegisterOnLocalTenant] Public client flow already enabled');
            return;
        }

        console.log('[RegisterOnLocalTenant] Enabling public client flow');
        await graphProvider.applications.update(owningApp.id!, {
            isFallbackPublicClient: true
        });

        // Verify propagation
        await RegisterOnLocalTenant.verifyAppConfiguration(
            graphProvider,
            containerType.owningAppId,
            (app) => app.isFallbackPublicClient === true,
            'public client flow'
        );
    }

    /**
     * Ensure identifier URI is configured
     */
    private static async ensureIdentifierUri(
        graphProvider: GraphProvider,
        containerType: ContainerType,
        owningApp: any
    ): Promise<void> {

        const expectedUri = this.IDENTIFIER_URI_TEMPLATE.replace('{appId}', containerType.owningAppId);

        if (owningApp.identifierUris?.includes(expectedUri)) {
            console.log('[RegisterOnLocalTenant] Identifier URI already configured');
            return;
        }

        console.log('[RegisterOnLocalTenant] Adding identifier URI:', expectedUri);
        await graphProvider.applications.update(owningApp.id!, {
            identifierUris: [expectedUri]
        });

        // Verify propagation
        await RegisterOnLocalTenant.verifyAppConfiguration(
            graphProvider,
            containerType.owningAppId,
            (app) => app.identifierUris?.includes(expectedUri) ?? false,
            'identifier URI'
        );
    }

    /**
     * Ensure redirect URIs are configured (broker + consent)
     */
    private static async ensureRedirectUris(
        graphProvider: GraphProvider,
        containerType: ContainerType,
        owningApp: any
    ): Promise<void> {

        const brokerUri = this.BROKER_REDIRECT_URI_TEMPLATE.replace('{appId}', containerType.owningAppId);
        const consentUri = this.CONSENT_REDIRECT_URI;

        const existingPublicClientUris = owningApp.publicClient?.redirectUris || [];
        const existingWebUris = owningApp.web?.redirectUris || [];

        const hasBrokerUri = existingPublicClientUris.includes(brokerUri);
        const hasConsentUri = existingWebUris.includes(consentUri);

        if (hasBrokerUri && hasConsentUri) {
            console.log('[RegisterOnLocalTenant] Redirect URIs already configured');
            return;
        }

        // Prepare updates
        const updates: any = {};

        if (!hasBrokerUri) {
            console.log('[RegisterOnLocalTenant] Adding broker redirect URI:', brokerUri);
            updates.publicClient = {
                ...(owningApp.publicClient || {}),
                redirectUris: [...existingPublicClientUris, brokerUri]
            };
        }

        if (!hasConsentUri) {
            console.log('[RegisterOnLocalTenant] Adding consent redirect URI:', consentUri);
            updates.web = {
                ...(owningApp.web || {}),
                redirectUris: [...existingWebUris, consentUri]
            };
        }

        // Apply updates
        await graphProvider.applications.update(owningApp.id!, updates);

        // Verify propagation
        await RegisterOnLocalTenant.verifyAppConfiguration(
            graphProvider,
            containerType.owningAppId,
            (app) => {
                const publicClientUris = app.publicClient?.redirectUris || [];
                const webUris = app.web?.redirectUris || [];
                return publicClientUris.includes(brokerUri) && webUris.includes(consentUri);
            },
            'redirect URIs'
        );
    }

    /**
     * Ensure required permissions are configured
     */
    private static async ensurePermissions(
        graphProvider: GraphProvider,
        containerType: ContainerType,
        owningApp: any
    ): Promise<boolean> {

        console.log('[RegisterOnLocalTenant] Checking permissions');
        const result = await graphProvider.applications.ensureContainerTypePermissions(
            containerType.owningAppId,
            { useAppId: true }
        );

        if (result.permissionsAdded) {
            console.log('[RegisterOnLocalTenant] Permissions added, verifying propagation');

            // Verify propagation - check that required permissions are present
            await RegisterOnLocalTenant.verifyAppConfiguration(
                graphProvider,
                containerType.owningAppId,
                (app) => {
                    const graphResource = app.requiredResourceAccess?.find(
                        (rra: any) => rra.resourceAppId === "00000003-0000-0000-c000-000000000000"
                    );
                    // Check that we have at least User.Read permission
                    return graphResource?.resourceAccess?.some(
                        (ra: any) => ra.id === "e1fe6dd8-ba31-4d61-89e7-88639da4683d" && ra.type === "Scope"
                    ) ?? false;
                },
                'permissions'
            );
        }

        return result.permissionsAdded;
    }

    /**
     * Generic verification function that polls until configuration propagates
     */
    private static async verifyAppConfiguration(
        graphProvider: GraphProvider,
        appId: string,
        checkFn: (app: any) => boolean,
        configName: string
    ): Promise<void> {

        console.log(`[RegisterOnLocalTenant] Verifying ${configName} propagation...`);

        const timer = new Timer(RegisterOnLocalTenant.MAX_PROPAGATION_WAIT_MS);
        let verified = false;

        while (!verified && !timer.finished) {
            await new Promise(r => setTimeout(r, RegisterOnLocalTenant.POLL_INTERVAL_MS));

            try {
                const app = await graphProvider.applications.get(appId, { useAppId: true });
                if (app && checkFn(app)) {
                    verified = true;
                    console.log(`[RegisterOnLocalTenant] ${configName} verified successfully`);
                }
            } catch (error) {
                // Continue polling
            }
        }

        if (!verified) {
            console.warn(`[RegisterOnLocalTenant] ${configName} verification timed out - continuing anyway`);
        }
    }

    /**
     * Request admin consent for the application
     *
     * NOTE: This method is OPTIONAL. VS Code's authentication API handles consent
     * automatically when calling appAuthProvider.getToken() with createIfNone: true.
     *
     * Use this method if you want to:
     * - Show an explicit consent prompt before token acquisition
     * - Give users control over when consent happens
     *
     * Skip this method to:
     * - Let VS Code handle consent automatically (simpler, better UX)
     * - Reduce code complexity
     *
     * See configureApplication() for toggle instructions.
     */
    private static async requestAdminConsent(
        containerType: ContainerType,
        tenantId: string,
        permissionsWereAdded: boolean
    ): Promise<boolean> {

        const openConsent = vscode.l10n.t('Open consent link');
        const buttons = [openConsent];

        const message = permissionsWereAdded
            ? vscode.l10n.t('Your owning app requires admin consent on your local tenant. Grant consent now?')
            : vscode.l10n.t('Verify that your owning app has admin consent on your local tenant. Grant consent now?');

        const choice = await vscode.window.showInformationMessage(
            message,
            ...buttons
        );

        if (choice !== openConsent) {
            // User dismissed or clicked away - continue without consent
            return true;
        }

        // Execute admin consent flow
        const consentProgress = new ProgressWaitNotification(
            vscode.l10n.t('Requesting admin consent...')
        );
        consentProgress.show();

        try {
            const consentGranted = await AdminConsentHelper.listenForAdminConsent(
                containerType.owningAppId,
                tenantId
            );

            consentProgress.hide();

            if (consentGranted) {
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Admin consent granted successfully!')
                );
                return true;
            } else {
                vscode.window.showWarningMessage(
                    vscode.l10n.t('Admin consent was not granted. You can grant it later through Azure Portal.')
                );
                return true; // Allow registration to continue
            }
        } catch (error: any) {
            consentProgress.hide();

            vscode.window.showErrorMessage(
                vscode.l10n.t('Consent flow failed: {0}', error.message || error)
            );
            return true; // Allow registration to continue anyway
        }
    }

    /**
     * Get authentication token for owning app and create registration service
     */
    private static async getOwningAppToken(
        containerType: ContainerType,
        account: any
    ): Promise<ContainerTypeRegistrationService | undefined> {

        console.log('[RegisterOnLocalTenant] Getting token for owning app:', containerType.owningAppId);

        const appAuthProvider = AppAuthProviderFactory.getProvider(
            containerType.owningAppId,
            account.tenantId
        );

        const accountInfo: vscode.AuthenticationSessionAccountInformation = {
            id: account.id,
            label: account.username
        };

        const progress = new ProgressWaitNotification(
            vscode.l10n.t('Authenticating with owning app (may require credentials)...')
        );
        progress.show();

        try {
            // Get delegated token for owning app
            await appAuthProvider.getToken(
                ['https://graph.microsoft.com/FileStorageContainerTypeReg.Manage.All'],
                true,  // Allow session creation
                accountInfo
            );

            console.log('[RegisterOnLocalTenant] Token obtained successfully');

            // Create Graph client with owning app auth
            const owningAppClient = Graph.Client.init({
                authProvider: appAuthProvider.getAuthHandler()
            });

            const registrationService = new ContainerTypeRegistrationService(owningAppClient);

            // ========================================================================
            // IMPORTANT: Wait for consent to propagate in Azure AD
            // ========================================================================
            // When consent happens automatically during token acquisition (VS Code),
            // Azure AD needs time to propagate those permissions. Without this wait,
            // the first registration attempt will fail with 403.
            // ========================================================================

            progress.hide();

            const propagationProgress = new ProgressWaitNotification(
                vscode.l10n.t('Waiting for permissions to propagate...')
            );
            propagationProgress.show();

            console.log('[RegisterOnLocalTenant] Verifying token permissions propagation...');

            const timer = new Timer(RegisterOnLocalTenant.MAX_PROPAGATION_WAIT_MS);
            let permissionsReady = false;

            while (!permissionsReady && !timer.finished) {
                await new Promise(r => setTimeout(r, RegisterOnLocalTenant.POLL_INTERVAL_MS));

                try {
                    // Test if we can actually use this token by listing registrations
                    await registrationService.list();
                    permissionsReady = true;
                    console.log('[RegisterOnLocalTenant] Token permissions verified - ready for registration');
                } catch (error: any) {
                    // If 403, permissions haven't propagated yet - continue polling
                    const errorCode = error.code || error.statusCode;
                    if (errorCode === 403) {
                        console.log('[RegisterOnLocalTenant] Permissions not yet propagated, waiting...');
                    } else {
                        // Other errors might be okay (e.g., 404 if no registrations exist yet)
                        // Consider them as "permissions are working"
                        permissionsReady = true;
                        console.log('[RegisterOnLocalTenant] API accessible (non-403 response) - continuing');
                    }
                }
            }

            propagationProgress.hide();

            if (!permissionsReady) {
                console.warn('[RegisterOnLocalTenant] Permission propagation verification timed out - continuing anyway');
            }

            return registrationService;

        } catch (error: any) {
            progress.hide();
            vscode.window.showErrorMessage(
                vscode.l10n.t('Failed to authenticate with owning app: {0}', error.message || error)
            );
            return undefined;
        }
    }

    /**
     * Register container type with full permissions and verify completion
     */
    private static async registerContainerType(
        containerType: ContainerType,
        registrationService: ContainerTypeRegistrationService,
        includeExtensionApp: boolean
    ): Promise<ContainerTypeRegistration | undefined> {

        const registrationData: ContainerTypeRegistrationCreate = {
            applicationPermissionGrants: [
                {
                    appId: containerType.owningAppId,
                    delegatedPermissions: ['full'],
                    applicationPermissions: ['full']
                },
                ...(includeExtensionApp ? [{
                    appId: clientId,
                    delegatedPermissions: [...REQUIRED_DELEGATED_PERMISSIONS],
                    applicationPermissions: []
                }] : [])
            ]
        };

        const progress = new ProgressWaitNotification(vscode.l10n.t('Registering container type...'));
        progress.show();
        let registration: ContainerTypeRegistration;
        try {
            registration = await registrationService.register(containerType.id, registrationData);
        } finally {
            progress.hide();
        }

        const verifyProgress = new ProgressWaitNotification(vscode.l10n.t('Verifying registration (may take a minute)...'));
        verifyProgress.show();
        const verified = await RegisterOnLocalTenant.verifyRegistration(registrationService, containerType.id);
        verifyProgress.hide();

        if (!verified) {
            void vscode.window.showWarningMessage(
                vscode.l10n.t('Registration initiated but verification timed out. Check status in a few minutes.')
            );
            DevelopmentTreeViewProvider.instance.refresh();
            return registration;
        }

        void vscode.window.showInformationMessage(
            vscode.l10n.t('Container type "{0}" registered successfully!', containerType.name)
        );
        try {
            await openStorageExplorerWhenReady(containerType, registration);
        } catch (error) {
            console.error('[RegisterOnLocalTenant] Storage Explorer handoff failed:', error);
            void vscode.window.showWarningMessage(vscode.l10n.t('Registration succeeded, but Storage Explorer could not be opened: {0}', error instanceof Error ? error.message : String(error)));
        }
        return registration;
    }

    /**
     * Verify registration has propagated
     */
    private static async verifyRegistration(
        registrationService: ContainerTypeRegistrationService,
        containerTypeId: string
    ): Promise<boolean> {

        const timer = new Timer(RegisterOnLocalTenant.MAX_PROPAGATION_WAIT_MS);

        while (!timer.finished) {
            try {
                const isRegistered = await registrationService.isRegistered(containerTypeId);
                if (isRegistered) {
                    console.log('[RegisterOnLocalTenant] Registration verified');
                    return true;
                }
            } catch (error) {
                // Continue polling
            }
            await new Promise(r => setTimeout(r, RegisterOnLocalTenant.POLL_INTERVAL_MS));
        }

        console.warn('[RegisterOnLocalTenant] Registration verification timed out');
        return false;
    }

    private static handleRegistrationError(containerType: ContainerType, error: unknown): void {
        const status = getGraphStatus(error);
        const detail = error instanceof Error ? error.message : String(error);
        console.error('[RegisterOnLocalTenant] Registration error:', error);
        if (status === 401 || status === 403 || (status === 400 && /consent|permission/i.test(detail))) {
            RegisterOnLocalTenant.showRegistrationFailure(containerType, vscode.l10n.t(
                'Check that the required consent has been granted in this tenant and that your account has permission to register container types. Graph reported: {0}', detail
            ), true);
        } else if (status === 405 || (status === 400 && /billing/i.test(detail))) {
            RegisterOnLocalTenant.showRegistrationFailure(containerType, vscode.l10n.t(
                'Verify that billing is set up if required. Graph reported: {0}', detail
            ), true);
        } else {
            RegisterOnLocalTenant.showRegistrationFailure(containerType, detail);
        }
    }
}

function getGraphStatus(error: unknown): number | undefined {
    if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number') {
        return error.statusCode;
    }
    return undefined;
}

// Accept both old and new ContainerType models for backward compatibility
export type RegistrationCommandProps = ContainerTypeTreeItem | StorageExplorerTreeItem | ContainerType;
