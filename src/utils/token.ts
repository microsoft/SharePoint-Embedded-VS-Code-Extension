/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import jwt_decode from "jwt-decode";

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