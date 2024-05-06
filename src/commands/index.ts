/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/naming-convention */
import { SignIn as _SignIn } from './SignIn';
import { SignOut as _SignOut } from './SignOut';
import { CreateTrialContainerType as _CreateTrialContainerType } from './ContainerTypes/CreateTrialContainerType';
import { RegisterContainerType as _RegisterContainerType } from './RegisterContainerType';
import { CreateGuestApp as _CreateGuestApp } from './CreateGuestApp';
import { DeleteContainerType as _DeleteContainerType } from './ContainerType/DeleteContainerType';
import { RefreshContainersList as _RefreshContainersList } from './RefreshContainersList';
import { CreateContainer as _CreateContainer } from './CreateContainer';
import { CloneRepo as _CloneRepo } from './CloneRepo';
import { ExportPostmanConfig as _ExportPostmanConfig } from './AppContextMenu/Postman/ExportPostmanConfig';
import { RenameApplication as _RenameApplication } from './RenameApplication';
import { CancelSignIn as _CancelSignIn } from './CancelSignIn';
import { Refresh as _Refresh } from './Refresh';
import { CopyContainerTypeId as _CopyContainerTypeId } from './ContainerType/CopyContainerTypeId';
import { CopyOwningTenantId as _CopyOwningTenantId} from './ContainerType/CopyOwningTenantId';
import { CopySubscriptionId as _CopySubscriptionId } from './ContainerType/CopySubscriptionId';
import { ViewProperties as _ViewProperties } from './ContainerType/ViewProperties';
import { CopyPostmanConfig as _CopyPostmanConfig } from './AppContextMenu/Postman/CopyPostmanConfig';
import { GetOrCreateApp as _GetOrCreateApp } from './Apps/GetOrCreateApp';
import { CreateAppCert as _CreateAppCert } from './AppContextMenu/CreateAppCert';
import { CreateSecret as _CreateSecret } from './AppContextMenu/CreateSecret';
import { RegisterOnLocalTenant as _RegisterOnLocalTenant } from './ContainerType/RegisterOnLocalTenant';
import { RenameContainerType as _RenameContainerType } from './ContainerType/RenameContainerType';

export namespace Commands {
  export const SignIn = _SignIn;
  export const SignOut = _SignOut;
  export const CancelSignIn = _CancelSignIn;
  export const CreateTrialContainerType = _CreateTrialContainerType;
  //export const RegisterContainerType = _RegisterContainerType;
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
  export const CopyPostmanConfig = _CopyPostmanConfig;
  export const ExportPostmanConfig = _ExportPostmanConfig;
  export const CreateAppCert = _CreateAppCert;
  export const CreateSecret = _CreateSecret;
}
