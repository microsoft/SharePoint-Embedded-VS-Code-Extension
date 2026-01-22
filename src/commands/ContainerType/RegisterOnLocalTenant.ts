/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../Command';
import * as vscode from 'vscode';
import * as Graph from '@microsoft/microsoft-graph-client';
import { ContainerType as NewContainerType, ContainerTypeRegistration, ContainerTypeRegistrationCreate } from '../../models/schemas';
import { ContainerType as OldContainerType } from '../../models/ContainerType';
import { ContainerTypeTreeItem } from '../../views/treeview/development/ContainerTypeTreeItem';
import { ApplicationPermissions } from '../../models/ApplicationPermissions';
import { GraphProvider } from '../../services/Graph/GraphProvider';
import { ContainerTypeRegistrationService } from '../../services/Graph/ContainerTypeRegistrationService';
import { AppAuthProviderFactory } from '../../services/Auth/AppAuthProviderFactory';
import { AuthenticationState } from '../../services/AuthenticationState';
import { ProgressWaitNotification, Timer } from '../../views/notifications/ProgressWaitNotification';
import { DevelopmentTreeViewProvider } from '../../views/treeview/development/DevelopmentTreeViewProvider';
import { AdminConsentHelper } from '../../utils/AdminConsentHelper';

/**
 * Command to register a container type on the local tenant
 *
 * Registration Flow:
 * 1. Validate authentication and get container type
 * 2. Check if already registered
 * 3. Get and configure owning application
 *    - Enable public client flow
 *    - Add identifier URI
 *    - Add redirect URIs (broker + consent)
 *    - Add required permissions
 *    - Verify each configuration step propagates
 * 4. Request admin consent
 * 5. Get token for owning app (delegated auth)
 * 6. Register container type with full permissions
 * 7. Verify registration completes
 */
export class RegisterOnLocalTenant extends Command {
    public static readonly COMMAND = 'ContainerType.registerOnLocalTenant';

    // Configuration constants
    private static readonly BROKER_REDIRECT_URI_TEMPLATE = 'ms-appx-web://Microsoft.AAD.BrokerPlugin/{appId}';
    private static readonly CONSENT_REDIRECT_URI = 'http://localhost/redirect';
    private static readonly IDENTIFIER_URI_TEMPLATE = 'api://{appId}';
    private static readonly MAX_PROPAGATION_WAIT_MS = 60000; // 60 seconds
    private static readonly POLL_INTERVAL_MS = 3000; // 3 seconds

    public static async run(
        commandProps?: RegistrationCommandProps,
        newApplicationPermissions?: ApplicationPermissions
    ): Promise<ContainerTypeRegistration | undefined> {

        // ============================================================================
        // SECTION 1: VALIDATION
        // ============================================================================

        const validationResult = await RegisterOnLocalTenant.validateAndGetContainerType(commandProps);
        if (!validationResult) {
            return undefined;
        }
        const { account, graphProvider, containerType } = validationResult;

        // ============================================================================
        // SECTION 2: CHECK EXISTING REGISTRATION
        // ============================================================================

        const shouldContinue = await RegisterOnLocalTenant.checkExistingRegistration(graphProvider, containerType);
        if (!shouldContinue) {
            return undefined;
        }

        // ============================================================================
        // SECTION 3: GET OWNING APPLICATION
        // ============================================================================

        const owningApp = await RegisterOnLocalTenant.getOwningApplication(graphProvider, containerType);
        if (!owningApp) {
            return undefined;
        }

        // ============================================================================
        // SECTION 4: CONFIGURE APPLICATION
        // ============================================================================

        const configSuccess = await RegisterOnLocalTenant.configureApplication(
            graphProvider,
            containerType,
            owningApp,
            account.tenantId
        );
        if (!configSuccess) {
            return undefined;
        }

        // ============================================================================
        // SECTION 5: GET OWNING APP TOKEN
        // ============================================================================

        const owningAppRegistrationService = await RegisterOnLocalTenant.getOwningAppToken(
            containerType,
            account
        );
        if (!owningAppRegistrationService) {
            return undefined;
        }

        // ============================================================================
        // SECTION 6: REGISTER CONTAINER TYPE
        // ============================================================================

        return await RegisterOnLocalTenant.registerContainerType(
            containerType,
            owningAppRegistrationService
        );
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    /**
     * Validate authentication and extract container type from command props
     */
    private static async validateAndGetContainerType(
        commandProps?: RegistrationCommandProps
    ): Promise<{ account: any; graphProvider: GraphProvider; containerType: NewContainerType } | undefined> {

        // Check authentication
        if (!AuthenticationState.isSignedIn()) {
            vscode.window.showErrorMessage('Please sign in to register container types.');
            return undefined;
        }

        const account = await AuthenticationState.getCurrentAccount();
        if (!account) {
            vscode.window.showErrorMessage('Failed to get account information.');
            return undefined;
        }

        const graphProvider = GraphProvider.getInstance();

        // Extract container type
        let containerType: NewContainerType;
        if (commandProps instanceof ContainerTypeTreeItem) {
            containerType = commandProps.containerType;
        } else if (commandProps) {
            containerType = commandProps as NewContainerType;
        } else {
            vscode.window.showErrorMessage('No container type provided.');
            return undefined;
        }

        if (!containerType?.id || !containerType?.owningAppId) {
            vscode.window.showErrorMessage('Invalid container type data.');
            return undefined;
        }

        return { account, graphProvider, containerType };
    }

    /**
     * Check if container type is already registered and prompt for re-registration
     */
    private static async checkExistingRegistration(
        graphProvider: GraphProvider,
        containerType: NewContainerType
    ): Promise<boolean> {

        try {
            const existingRegistration = await graphProvider.registrations.get(containerType.id);
            if (existingRegistration) {
                const reRegister = 'Re-register';
                const cancel = 'Cancel';
                const choice = await vscode.window.showWarningMessage(
                    vscode.l10n.t('This container type is already registered. Would you like to re-register?'),
                    reRegister,
                    cancel
                );
                return choice === reRegister;
            }
        } catch (error) {
            // Not registered yet - this is expected, continue
            console.log('[RegisterOnLocalTenant] Container type not yet registered');
        }
        return true;
    }

    /**
     * Get owning application details
     */
    private static async getOwningApplication(
        graphProvider: GraphProvider,
        containerType: NewContainerType
    ): Promise<any> {

        try {
            const app = await graphProvider.applications.get(
                containerType.owningAppId,
                { useAppId: true }
            );

            if (!app) {
                vscode.window.showErrorMessage('Failed to find owning application.');
                return undefined;
            }

            return app;
        } catch (error: any) {
            vscode.window.showErrorMessage(
                vscode.l10n.t('Failed to find owning application: {0}', error.message || error)
            );
            return undefined;
        }
    }

    /**
     * Configure application for container type registration
     * This includes: public client flow, URIs, permissions, and admin consent
     */
    private static async configureApplication(
        graphProvider: GraphProvider,
        containerType: NewContainerType,
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
            const cancel = 'Cancel';
            const choice = await vscode.window.showWarningMessage(
                vscode.l10n.t('Failed to configure app: {0}. Continue with registration?', error.message || error),
                { modal: true },
                continueAnyway,
                cancel
            );

            return choice === continueAnyway;
        }
    }

    /**
     * Ensure public client flow is enabled (required for Windows broker authentication)
     */
    private static async ensurePublicClientFlow(
        graphProvider: GraphProvider,
        containerType: NewContainerType,
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
        containerType: NewContainerType,
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
        containerType: NewContainerType,
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
        containerType: NewContainerType,
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
        containerType: NewContainerType,
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
        containerType: NewContainerType,
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
        containerType: NewContainerType,
        registrationService: ContainerTypeRegistrationService
    ): Promise<ContainerTypeRegistration | undefined> {

        const progress = new ProgressWaitNotification(
            vscode.l10n.t('Registering container type...')
        );
        progress.show();

        try {
            // Prepare registration data with full permissions
            const registrationData: ContainerTypeRegistrationCreate = {
                applicationPermissionGrants: [{
                    appId: containerType.owningAppId,
                    delegatedPermissions: ['full'],
                    applicationPermissions: ['full']
                }]
            };

            console.log('[RegisterOnLocalTenant] Registering:', containerType.id);
            console.log('[RegisterOnLocalTenant] Data:', JSON.stringify(registrationData, null, 2));

            // Execute registration
            const registration = await registrationService.register(
                containerType.id,
                registrationData
            );

            console.log('[RegisterOnLocalTenant] Registration API call succeeded');

            // Verify registration propagation
            progress.hide();
            const verifyProgress = new ProgressWaitNotification(
                vscode.l10n.t('Verifying registration (may take a minute)...')
            );
            verifyProgress.show();

            const verified = await RegisterOnLocalTenant.verifyRegistration(
                registrationService,
                containerType.id
            );

            verifyProgress.hide();

            if (verified) {
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Container type "{0}" registered successfully!', containerType.name)
                );
            } else {
                vscode.window.showWarningMessage(
                    vscode.l10n.t('Registration initiated but verification timed out. Check status in a few minutes.')
                );
            }

            // Refresh tree view
            DevelopmentTreeViewProvider.instance.refresh();

            return registration;

        } catch (error: any) {
            progress.hide();
            RegisterOnLocalTenant.handleRegistrationError(error);
            return undefined;
        }
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

    /**
     * Handle registration errors with user-friendly messages
     */
    private static handleRegistrationError(error: any): void {
        const errorCode = error.code || error.statusCode;
        const errorMessage = error.message || error.body?.error?.message || 'Unknown error';

        switch (errorCode) {
            case 404:
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Container type or application not found.')
                );
                break;
            case 403:
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Access denied. Possible causes: 1) Admin consent not propagated yet (retry in a few minutes), 2) Insufficient permissions, 3) Not an admin user. Error: {0}', errorMessage)
                );
                break;
            case 405:
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Registration not allowed. Standard container types require valid billing. New tenants may need to wait an hour.')
                );
                break;
            case 400:
                if (errorMessage.includes('billing')) {
                    vscode.window.showErrorMessage(
                        vscode.l10n.t('Invalid billing status.')
                    );
                } else if (errorMessage.includes('trial') || errorMessage.includes('expired')) {
                    vscode.window.showErrorMessage(
                        vscode.l10n.t('Trial container type has expired.')
                    );
                } else {
                    vscode.window.showErrorMessage(
                        vscode.l10n.t('Registration failed: {0}', errorMessage)
                    );
                }
                break;
            case 409:
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Container type is already registered.')
                );
                break;
            default:
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Registration failed: {0}', errorMessage)
                );
        }

        console.error('[RegisterOnLocalTenant] Registration error:', error);
    }
}

// Accept both old and new ContainerType models for backward compatibility
export type RegistrationCommandProps = ContainerTypeTreeItem | NewContainerType | OldContainerType;
