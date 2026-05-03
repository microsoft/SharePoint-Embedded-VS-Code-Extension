/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import jwt_decode from "jwt-decode";

// Entra ID built-in directory role template IDs surface as "wids" claims on
// access tokens. Global Administrator is the role that gates SharePoint
// Embedded billing setup in the M365 admin center.
export const GLOBAL_ADMINISTRATOR_WID = "62e90394-69f5-4237-9190-012177145e10";

export function checkJwtForGlobalAdmin(decodedToken: any): boolean {
  const wids = decodedToken?.wids;
  if (!Array.isArray(wids)) {
    return false;
  }
  return wids.some((wid: unknown) =>
    typeof wid === "string" && wid.toLowerCase() === GLOBAL_ADMINISTRATOR_WID
  );
}

export function checkJwtForTenantAdminScope(decodedToken: any, scope: string): boolean {
  try {
    if (!decodedToken.scp) {
      return false;
    }
    const scopes = decodedToken.scp as string;
    if (scopes.includes(scope)) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    throw error;
  }
}

export function checkJwtForAppOnlyRole(decodedToken: any, role: string): boolean {
  if (!decodedToken.roles) {
    return false;
  }
  const roles = decodedToken.roles as string[];
  if (roles.includes(role)) {
    return true;
  } else {
    return false;
  }
}

export function getJwtTenantId(decodedToken: any): string | undefined {
  return decodedToken.tid;
}

export function decodeJwt(accessToken: string): any {
  try {
    return jwt_decode(accessToken);
  } catch (error) {
    throw error;
  }
}