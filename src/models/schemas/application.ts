/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';

/**
 * Sign-in audience values for applications
 */
export const signInAudienceSchema = z.enum([
    'AzureADMyOrg',
    'AzureADMultipleOrgs', 
    'AzureADandPersonalMicrosoftAccount',
    'PersonalMicrosoftAccount'
]);

/**
 * Native authentication APIs enabled values
 */
export const nativeAuthenticationApisEnabledSchema = z.enum([
    'none',
    'all',
    'unknownFutureValue'
]);

/**
 * Group membership claims values
 */
export const groupMembershipClaimsSchema = z.enum([
    'None',
    'SecurityGroup',
    'All'
]);

/**
 * Legal age group rule values for parental controls
 */
export const legalAgeGroupRuleSchema = z.enum([
    'Allow',
    'RequireConsentForPrivacyServices',
    'RequireConsentForMinors',
    'RequireConsentForKids',
    'BlockMinors'
]);

/**
 * Add-in schema for application add-ins
 */
export const addInSchema = z.object({
    id: z.string().optional(),
    type: z.string().optional(),
    properties: z.array(z.object({
        key: z.string(),
        value: z.string()
    })).optional()
});

/**
 * OAuth2 permission scope schema
 */
export const oauth2PermissionScopeSchema = z.object({
    adminConsentDescription: z.string().optional(),
    adminConsentDisplayName: z.string().optional(),
    id: z.string(),
    isEnabled: z.boolean(),
    type: z.string(),
    userConsentDescription: z.string().optional(),
    userConsentDisplayName: z.string().optional(),
    value: z.string()
});

/**
 * Pre-authorized application schema
 */
export const preAuthorizedApplicationSchema = z.object({
    appId: z.string(),
    delegatedPermissionIds: z.array(z.string())
});

/**
 * API application schema
 */
export const apiApplicationSchema = z.object({
    acceptMappedClaims: z.boolean().nullable().optional(),
    knownClientApplications: z.array(z.string()).optional(),
    oauth2PermissionScopes: z.array(oauth2PermissionScopeSchema).optional(),
    preAuthorizedApplications: z.array(preAuthorizedApplicationSchema).optional(),
    requestedAccessTokenVersion: z.number().nullable().optional()
});

/**
 * App role schema
 */
export const appRoleSchema = z.object({
    allowedMemberTypes: z.array(z.string()),
    description: z.string(),
    displayName: z.string(),
    id: z.string(),
    isEnabled: z.boolean(),
    origin: z.string().optional(),
    value: z.string()
});

/**
 * Certification schema
 */
export const certificationSchema = z.object({
    certificationDetailsUrl: z.string().optional(),
    certificationExpirationDateTime: z.string().optional(),
    isCertifiedByMicrosoft: z.boolean().optional(),
    isPublisherAttested: z.boolean().optional(),
    lastCertificationDateTime: z.string().optional()
});

/**
 * Informational URL schema
 */
export const informationalUrlSchema = z.object({
    logoUrl: z.string().nullable().optional(),
    marketingUrl: z.string().nullable().optional(),
    privacyStatementUrl: z.string().nullable().optional(),
    supportUrl: z.string().nullable().optional(),
    termsOfServiceUrl: z.string().nullable().optional()
});

/**
 * Key credential schema
 */
export const keyCredentialSchema = z.object({
    customKeyIdentifier: z.string().optional(),
    displayName: z.string().optional(),
    endDateTime: z.string().optional(),
    key: z.string().optional(),
    keyId: z.string(),
    startDateTime: z.string().optional(),
    type: z.string().optional(),
    usage: z.string().optional()
});

/**
 * Optional claims schema
 */
export const optionalClaimsSchema = z.object({
    accessToken: z.array(z.object({
        additionalProperties: z.array(z.string()).optional(),
        essential: z.boolean().optional(),
        name: z.string(),
        source: z.string().optional()
    })).optional(),
    idToken: z.array(z.object({
        additionalProperties: z.array(z.string()).optional(),
        essential: z.boolean().optional(),
        name: z.string(),
        source: z.string().optional()
    })).optional(),
    saml2Token: z.array(z.object({
        additionalProperties: z.array(z.string()).optional(),
        essential: z.boolean().optional(),
        name: z.string(),
        source: z.string().optional()
    })).optional()
});

/**
 * Parental control settings schema
 */
export const parentalControlSettingsSchema = z.object({
    countriesBlockedForMinors: z.array(z.string()).optional(),
    legalAgeGroupRule: legalAgeGroupRuleSchema.optional()
});

/**
 * Password credential schema
 */
export const passwordCredentialSchema = z.object({
    customKeyIdentifier: z.string().optional(),
    displayName: z.string().optional(),
    endDateTime: z.string().optional(),
    hint: z.string().optional(),
    keyId: z.string(),
    secretText: z.string().optional(),
    startDateTime: z.string().optional()
});

/**
 * Public client application schema
 */
export const publicClientApplicationSchema = z.object({
    redirectUris: z.array(z.string()).optional()
});

/**
 * Required resource access schema
 */
export const requiredResourceAccessSchema = z.object({
    resourceAppId: z.string(),
    resourceAccess: z.array(z.object({
        id: z.string(),
        type: z.string()
    }))
});

/**
 * Request signature verification schema
 */
export const requestSignatureVerificationSchema = z.object({
    signedRequestsRequired: z.boolean().optional(),
    isSignedRequestRequired: z.boolean().optional()
});

/**
 * Service principal lock configuration schema
 */
export const servicePrincipalLockConfigurationSchema = z.object({
    isEnabled: z.boolean().optional(),
    allProperties: z.boolean().optional(),
    credentialsWithUsageSign: z.boolean().optional(),
    credentialsWithUsageVerify: z.boolean().optional(),
    tokenEncryptionKeyId: z.boolean().optional()
});

/**
 * Implicit grant settings schema
 */
export const implicitGrantSettingsSchema = z.object({
    enableAccessTokenIssuance: z.boolean().optional(),
    enableIdTokenIssuance: z.boolean().optional()
});

/**
 * SPA application schema
 */
export const spaApplicationSchema = z.object({
    redirectUris: z.array(z.string()).optional()
});

/**
 * Verified publisher schema
 */
export const verifiedPublisherSchema = z.object({
    displayName: z.string().nullable().optional(),
    verifiedPublisherId: z.string().nullable().optional(),
    addedDateTime: z.string().nullable().optional()
});

/**
 * Web application schema
 */
export const webApplicationSchema = z.object({
    homePageUrl: z.string().nullable().optional(),
    implicitGrantSettings: implicitGrantSettingsSchema.optional(),
    logoutUrl: z.string().nullable().optional(),
    redirectUris: z.array(z.string()).optional()
});

/**
 * Add password credential request schema
 */
export const addPasswordCredentialRequestSchema = z.object({
    displayName: z.string().optional(),
    endDateTime: z.string().optional(),
    startDateTime: z.string().optional()
});

/**
 * Remove password credential request schema
 */
export const removePasswordCredentialRequestSchema = z.object({
    keyId: z.string()
});

/**
 * Add key credential request schema
 */
export const addKeyCredentialRequestSchema = z.object({
    keyCredential: z.object({
        type: z.enum(['AsymmetricX509Cert', 'X509CertAndPassword']),
        usage: z.enum(['Verify', 'Sign']),
        key: z.string()
    }),
    passwordCredential: z.object({
        secretText: z.string()
    }).optional().nullable(),
    proof: z.string()
});

/**
 * Remove key credential request schema
 */
export const removeKeyCredentialRequestSchema = z.object({
    keyId: z.string(),
    proof: z.string()
});

/**
 * Main application schema representing the full Microsoft Graph application resource
 */
export const applicationSchema = z.object({
    // Core properties
    id: z.string().optional(),
    appId: z.string().optional(),
    applicationTemplateId: z.string().nullable().optional(),
    createdDateTime: z.string().optional(),
    deletedDateTime: z.string().nullable().optional(),
    displayName: z.string(),
    description: z.string().nullable().optional(),
    
    // Configuration properties
    disabledByMicrosoftStatus: z.string().nullable().optional(),
    groupMembershipClaims: groupMembershipClaimsSchema.nullable().optional(),
    identifierUris: z.array(z.string()).optional(),
    isDeviceOnlyAuthSupported: z.boolean().nullable().optional(),
    isFallbackPublicClient: z.boolean().nullable().optional(),
    nativeAuthenticationApisEnabled: nativeAuthenticationApisEnabledSchema.nullable().optional(),
    notes: z.string().nullable().optional(),
    oauth2RequiredPostResponse: z.boolean().optional(),
    publisherDomain: z.string().optional(),
    samlMetadataUrl: z.string().nullable().optional(),
    serviceManagementReference: z.string().nullable().optional(),
    signInAudience: signInAudienceSchema.optional(),
    tags: z.array(z.string()).optional(),
    tokenEncryptionKeyId: z.string().nullable().optional(),
    uniqueName: z.string().nullable().optional(),
    
    // Complex object properties
    addIns: z.array(addInSchema).optional(),
    api: apiApplicationSchema.nullable().optional(),
    appRoles: z.array(appRoleSchema).optional(),
    certification: certificationSchema.nullable().optional(),
    info: informationalUrlSchema.optional(),
    keyCredentials: z.array(keyCredentialSchema).optional(),
    optionalClaims: optionalClaimsSchema.nullable().optional(),
    parentalControlSettings: parentalControlSettingsSchema.optional(),
    passwordCredentials: z.array(passwordCredentialSchema).optional(),
    publicClient: publicClientApplicationSchema.optional(),
    requiredResourceAccess: z.array(requiredResourceAccessSchema).optional(),
    requestSignatureVerification: requestSignatureVerificationSchema.nullable().optional(),
    servicePrincipalLockConfiguration: servicePrincipalLockConfigurationSchema.nullable().optional(),
    spa: spaApplicationSchema.optional(),
    verifiedPublisher: verifiedPublisherSchema.optional(),
    web: webApplicationSchema.optional()
});

/**
 * Application create schema - subset of properties allowed when creating
 */
export const applicationCreateSchema = applicationSchema.pick({
    displayName: true,
    description: true,
    groupMembershipClaims: true,
    identifierUris: true,
    isDeviceOnlyAuthSupported: true,
    isFallbackPublicClient: true,
    nativeAuthenticationApisEnabled: true,
    notes: true,
    oauth2RequiredPostResponse: true,
    samlMetadataUrl: true,
    serviceManagementReference: true,
    signInAudience: true,
    tags: true,
    tokenEncryptionKeyId: true,
    uniqueName: true,
    addIns: true,
    api: true,
    appRoles: true,
    info: true,
    keyCredentials: true,
    optionalClaims: true,
    parentalControlSettings: true,
    passwordCredentials: true,
    publicClient: true,
    requiredResourceAccess: true,
    requestSignatureVerification: true,
    servicePrincipalLockConfiguration: true,
    spa: true,
    web: true
});

/**
 * Application update schema - subset of properties that can be updated
 */
export const applicationUpdateSchema = applicationSchema.pick({
    displayName: true,
    description: true,
    groupMembershipClaims: true,
    identifierUris: true,
    isDeviceOnlyAuthSupported: true,
    isFallbackPublicClient: true,
    nativeAuthenticationApisEnabled: true,
    notes: true,
    oauth2RequiredPostResponse: true,
    samlMetadataUrl: true,
    serviceManagementReference: true,
    signInAudience: true,
    tags: true,
    tokenEncryptionKeyId: true,
    uniqueName: true,
    addIns: true,
    api: true,
    appRoles: true,
    info: true,
    keyCredentials: true,
    optionalClaims: true,
    parentalControlSettings: true,
    publicClient: true,
    requiredResourceAccess: true,
    requestSignatureVerification: true,
    servicePrincipalLockConfiguration: true,
    spa: true,
    web: true
}).partial();

// Type exports
export type Application = z.infer<typeof applicationSchema>;
export type ApplicationCreate = z.infer<typeof applicationCreateSchema>;
export type ApplicationUpdate = z.infer<typeof applicationUpdateSchema>;
export type SignInAudience = z.infer<typeof signInAudienceSchema>;
export type NativeAuthenticationApisEnabled = z.infer<typeof nativeAuthenticationApisEnabledSchema>;
export type GroupMembershipClaims = z.infer<typeof groupMembershipClaimsSchema>;
export type LegalAgeGroupRule = z.infer<typeof legalAgeGroupRuleSchema>;
export type AddIn = z.infer<typeof addInSchema>;
export type ApiApplication = z.infer<typeof apiApplicationSchema>;
export type AppRole = z.infer<typeof appRoleSchema>;
export type Certification = z.infer<typeof certificationSchema>;
export type InformationalUrl = z.infer<typeof informationalUrlSchema>;
export type KeyCredential = z.infer<typeof keyCredentialSchema>;
export type OptionalClaims = z.infer<typeof optionalClaimsSchema>;
export type ParentalControlSettings = z.infer<typeof parentalControlSettingsSchema>;
export type PasswordCredential = z.infer<typeof passwordCredentialSchema>;
export type PublicClientApplication = z.infer<typeof publicClientApplicationSchema>;
export type RequiredResourceAccess = z.infer<typeof requiredResourceAccessSchema>;
export type RequestSignatureVerification = z.infer<typeof requestSignatureVerificationSchema>;
export type ServicePrincipalLockConfiguration = z.infer<typeof servicePrincipalLockConfigurationSchema>;
export type SpaApplication = z.infer<typeof spaApplicationSchema>;
export type VerifiedPublisher = z.infer<typeof verifiedPublisherSchema>;
export type WebApplication = z.infer<typeof webApplicationSchema>;
export type AddPasswordCredentialRequest = z.infer<typeof addPasswordCredentialRequestSchema>;
export type RemovePasswordCredentialRequest = z.infer<typeof removePasswordCredentialRequestSchema>;
export type AddKeyCredentialRequest = z.infer<typeof addKeyCredentialRequestSchema>;
export type RemoveKeyCredentialRequest = z.infer<typeof removeKeyCredentialRequestSchema>;