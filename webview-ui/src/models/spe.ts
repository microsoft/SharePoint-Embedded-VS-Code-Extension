/**
 * SPE-specific domain types and helpers that extend or complement
 * the types provided by @microsoft/microsoft-graph-types.
 */

import type { ColumnDefinition, DriveItem, FileStorageContainerCustomPropertyValue, Identity } from '@microsoft/microsoft-graph-types';

// ── DriveItem augmentation ────────────────────────────────────────────────────

/**
 * `@microsoft.graph.downloadUrl` is a pre-authenticated temporary download URL
 * that Graph returns on DriveItem when explicitly `$select`-ed.  Because the
 * property name contains `@` and `.` it cannot be modelled in normal TypeScript
 * interface syntax, so the library omits it entirely.
 *
 * Use this intersection type whenever you're mapping a raw API response that
 * may include the annotation, e.g.:
 *   `GET /drive/items/{id}?$select=id,name,@microsoft.graph.downloadUrl`
 */
export type SpeDriveItem = DriveItem & {
    '@microsoft.graph.downloadUrl'?: string | null;
};

// ── Identity augmentation ─────────────────────────────────────────────────────

/**
 * The Graph `Identity` interface only carries `displayName` and `id`.
 * In practice the permissions-related APIs also return `userPrincipalName`
 * on user identities, but the library types don't model it.  This
 * intersection type adds the field so we can work with it safely.
 */
export type SpeIdentity = Identity & { userPrincipalName?: string | null; email?: string | null };

// ── Container permissions ─────────────────────────────────────────────────────

/** SPE container permission roles (not modelled as an enum in graph-types). */
export type ContainerRole = 'owner' | 'manager' | 'writer' | 'reader';

// ── Column type helpers ───────────────────────────────────────────────────────

/**
 * Presentation-layer column type discriminator.
 * Derived at runtime from whichever facet property is present on a
 * ColumnDefinition, rather than being stored as a separate field.
 */
export type ColumnTypeName =
    | 'text'
    | 'boolean'
    | 'dateTime'
    | 'currency'
    | 'choice'
    | 'hyperlinkOrPicture'
    | 'number'
    | 'personOrGroup';

/**
 * Derive the ColumnTypeName for a ColumnDefinition by inspecting which
 * facet property is set.  Falls back to 'text' when no other facet is found.
 */
export function getColumnTypeName(col: ColumnDefinition): ColumnTypeName {
    if (col.boolean           != null) return 'boolean';
    if (col.choice            != null) return 'choice';
    if (col.dateTime          != null) return 'dateTime';
    if (col.currency          != null) return 'currency';
    if (col.hyperlinkOrPicture != null) return 'hyperlinkOrPicture';
    if (col.number            != null) return 'number';
    if (col.personOrGroup     != null) return 'personOrGroup';
    return 'text';
}

// ── Container custom properties  ─────────────────────────────────────────────

/**
 * Typed container custom properties dictionary.
 * Mirrors the shape returned by Graph API:
 *   GET /storage/fileStorage/containers/{id}/customProperties
 */
export type ContainerCustomProperties = Record<string, FileStorageContainerCustomPropertyValue>;

// ── People picker ─────────────────────────────────────────────────────────────

/**
 * People-picker suggestion item for the UI autocomplete — a minimal
 * projection of a Graph User or Group resource.
 */
export interface PeopleSuggestion {
    id: string;
    displayName: string;
    /**
     * Contact / invitation email address.  May differ from `userPrincipalName`
     * in federated or multi-domain tenants.
     */
    email: string;
    /**
     * Azure AD user principal name (sign-in name).  Undefined for groups,
     * which don't have a UPN.  This is the identifier the permissions APIs
     * most commonly use to resolve identities.
     */
    userPrincipalName?: string;
    kind: 'user' | 'group';
}
