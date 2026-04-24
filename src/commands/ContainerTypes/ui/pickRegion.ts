/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

// Regions where Microsoft.Syntex/accounts can be provisioned. Sourced from
// the ARM 400 error that lists supported locations when an unsupported one
// is used; stable enough to hardcode rather than fetch each time.
const SYNTEX_REGIONS: ReadonlyArray<{ slug: string; displayName: string }> = [
    { slug: 'eastus', displayName: 'East US' },
    { slug: 'eastus2', displayName: 'East US 2' },
    { slug: 'centralus', displayName: 'Central US' },
    { slug: 'northcentralus', displayName: 'North Central US' },
    { slug: 'southcentralus', displayName: 'South Central US' },
    { slug: 'westcentralus', displayName: 'West Central US' },
    { slug: 'westus', displayName: 'West US' },
    { slug: 'canadacentral', displayName: 'Canada Central' },
    { slug: 'canadaeast', displayName: 'Canada East' },
    { slug: 'brazilsouth', displayName: 'Brazil South' },
    { slug: 'northeurope', displayName: 'North Europe' },
    { slug: 'westeurope', displayName: 'West Europe' },
    { slug: 'uksouth', displayName: 'UK South' },
    { slug: 'ukwest', displayName: 'UK West' },
    { slug: 'francecentral', displayName: 'France Central' },
    { slug: 'francesouth', displayName: 'France South' },
    { slug: 'germanynorth', displayName: 'Germany North' },
    { slug: 'norwayeast', displayName: 'Norway East' },
    { slug: 'norwaywest', displayName: 'Norway West' },
    { slug: 'switzerlandnorth', displayName: 'Switzerland North' },
    { slug: 'switzerlandwest', displayName: 'Switzerland West' },
    { slug: 'australiaeast', displayName: 'Australia East' },
    { slug: 'australiasoutheast', displayName: 'Australia Southeast' },
    { slug: 'centralindia', displayName: 'Central India' },
    { slug: 'southindia', displayName: 'South India' },
    { slug: 'westindia', displayName: 'West India' },
    { slug: 'japaneast', displayName: 'Japan East' },
    { slug: 'koreacentral', displayName: 'Korea Central' },
    { slug: 'eastasia', displayName: 'East Asia' },
    { slug: 'southeastasia', displayName: 'Southeast Asia' },
    { slug: 'uaenorth', displayName: 'UAE North' },
    { slug: 'southafricanorth', displayName: 'South Africa North' },
    { slug: 'southafricawest', displayName: 'South Africa West' }
];

export function isSyntexSupportedRegion(slug: string | undefined): boolean {
    if (!slug) { return false; }
    const normalized = slug.toLowerCase();
    return SYNTEX_REGIONS.some(r => r.slug === normalized);
}

interface RegionQuickPickItem extends vscode.QuickPickItem {
    slug: string;
}

/**
 * Returns a Syntex-supported region for the billing account. If
 * `resourceGroupLocation` is already supported, returns it directly (no
 * prompt). Otherwise prompts the user to pick a supported region.
 *
 * Returns `undefined` if the user cancels the picker.
 */
export async function pickSyntexRegion(resourceGroupLocation: string): Promise<string | undefined> {
    if (isSyntexSupportedRegion(resourceGroupLocation)) {
        return resourceGroupLocation.toLowerCase();
    }

    const items: RegionQuickPickItem[] = SYNTEX_REGIONS.map(r => ({
        slug: r.slug,
        label: r.displayName,
        description: r.slug
    }));

    const picked = await vscode.window.showQuickPick<RegionQuickPickItem>(items, {
        title: vscode.l10n.t('Pick a region for the billing account'),
        placeHolder: vscode.l10n.t(
            'Microsoft.Syntex is not available in "{0}". Pick a supported region instead.',
            resourceGroupLocation
        ),
        matchOnDescription: true,
        ignoreFocusOut: true
    });

    return picked?.slug;
}
