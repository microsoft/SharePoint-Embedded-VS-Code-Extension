/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/naming-convention */
import { CancelSignIn as _CancelSignIn } from './CancelSignIn';
import { CloneRepo as _CloneRepo } from './CloneRepo';
import { CopyContainerTypeId as _CopyContainerTypeId } from './ContainerType/CopyContainerTypeId';
import { CopyOwningTenantId as _CopyOwningTenantId} from './ContainerType/CopyOwningTenantId';
import { CopyPostmanConfig as _CopyPostmanConfig } from './App/Postman/CopyPostmanConfig';
import { CopySubscriptionId as _CopySubscriptionId } from './ContainerType/CopySubscriptionId';
import { CreateAppCert as _CreateAppCert } from './App/Credentials/CreateAppCert';
import { ForgetAppCert as _ForgetAppCert } from './App/Credentials/ForgetCert';
import { CreateContainer as _CreateContainer } from './CreateContainer';
import { CreateGuestApp as _CreateGuestApp } from './CreateGuestApp';
import { CreatePostmanConfig as _CreatePostmanConfig } from './App/Postman/CreatePostmanConfig';
import { CreateSecret as _CreateSecret } from './App/Credentials/CreateSecret';
import { ForgetAppSecret as _ForgetAppSecret } from './App/Credentials/ForgetSecret';
import { GetLocalAdminConsent as _GetLocalAdminConsent } from './App/GetLocalAdminConsent';
import { CreateTrialContainerType as _CreateTrialContainerType } from './ContainerTypes/CreateTrialContainerType';
import { DeleteContainerType as _DeleteContainerType } from './ContainerType/DeleteContainerType';
import { ExportPostmanConfig as _ExportPostmanConfig } from './App/Postman/ExportPostmanConfig';
import { GetOrCreateApp as _GetOrCreateApp } from './Apps/GetOrCreateApp';
import { Refresh as _Refresh } from './Refresh';
import { RefreshContainersList as _RefreshContainersList } from './RefreshContainersList';
import { RegisterContainerType as _RegisterContainerType } from './RegisterContainerType';
import { RegisterOnLocalTenant as _RegisterOnLocalTenant } from './ContainerType/RegisterOnLocalTenant';
import { RenameApplication as _RenameApplication } from './RenameApplication';
import { RenameContainerType as _RenameContainerType } from './ContainerType/RenameContainerType';
import { SignIn as _SignIn } from './SignIn';
import { SignOut as _SignOut } from './SignOut';
import { ViewInAzure as _ViewInAzure } from './App/ViewInAzure';
import { ViewProperties as _ViewProperties } from './ContainerType/ViewProperties';

export namespace Commands {
  export const SignIn = _SignIn;
  export const SignOut = _SignOut;
  export const CancelSignIn = _CancelSignIn;
  export const CreateTrialContainerType = _CreateTrialContainerType;
  export const CreateGuestApp = _CreateGuestApp;
  export const DeleteContainerType = _DeleteContainerType;
  export const RefreshContainersList = _RefreshContainersList;
  export const CreateContainer = _CreateContainer;
  export const CloneRepo = _CloneRepo;
  export const RenameApplication = _RenameApplication;
  export const Refresh = _Refresh;

  // Container Type Commands
  export const CopyContainerTypeId = _CopyContainerTypeId;
  export const CopyOwningTenantId = _CopyOwningTenantId;
  export const CopySubscriptionId = _CopySubscriptionId;
  export const ViewProperties = _ViewProperties;
  export const RegisterOnLocalTenant = _RegisterOnLocalTenant;
  export const RenameContainerType = _RenameContainerType;

  // Apps Commands
  export const GetOrCreateApp = _GetOrCreateApp;

  // App Commands
  export const CreatePostmanConfig = _CreatePostmanConfig;
  export const CopyPostmanConfig = _CopyPostmanConfig;
  export const ExportPostmanConfig = _ExportPostmanConfig;
  export const CreateAppCert = _CreateAppCert;
  export const ForgetAppCert = _ForgetAppCert;
  export const CreateSecret = _CreateSecret;
  export const GetLocalAdminConsent = _GetLocalAdminConsent;
  export const ForgetAppSecret = _ForgetAppSecret;
  export const ViewInAzure = _ViewInAzure;
}
