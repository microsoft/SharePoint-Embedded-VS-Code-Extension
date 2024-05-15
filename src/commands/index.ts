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
import { CreateContainer as _CreateContainer } from './Containers/CreateContainer';
import { CreateGuestApp as _CreateGuestApp } from './CreateGuestApp';
import { CreatePostmanConfig as _CreatePostmanConfig } from './App/Postman/CreatePostmanConfig';
import { CreateSecret as _CreateSecret } from './App/Credentials/CreateSecret';
import { ForgetAppSecret as _ForgetAppSecret } from './App/Credentials/ForgetSecret';
import { CopySecret as _CopySecret } from './App/Credentials/CopySecret';
import { CreateTrialContainerType as _CreateTrialContainerType } from './ContainerTypes/CreateTrialContainerType';
import { CreatePaidContainerType as _CreatePaidContainerType } from './ContainerTypes/CreateStandardContainerType';
import { DeleteContainerType as _DeleteContainerType } from './ContainerType/DeleteContainerType';
import { ExportPostmanConfig as _ExportPostmanConfig } from './App/Postman/ExportPostmanConfig';
import { GetOrCreateApp as _GetOrCreateApp } from './Apps/GetOrCreateApp';
import { Refresh as _Refresh } from './Refresh';
import { RefreshContainersList as _RefreshContainersList } from './RefreshContainersList';
import { RegisterContainerType as _RegisterContainerType } from './RegisterContainerType';
import { RegisterOnLocalTenant as _RegisterOnLocalTenant } from './ContainerType/RegisterOnLocalTenant';
import { GetLocalAdminConsent as _GetLocalAdminConsent } from './App/GetLocalAdminConsent';
import { RenameApplication as _RenameApplication } from './RenameApplication';
import { RenameContainerType as _RenameContainerType } from './ContainerType/RenameContainerType';
import { SignIn as _SignIn } from './SignIn';
import { SignOut as _SignOut } from './SignOut';
import { ViewInAzure as _ViewInAzure } from './App/ViewInAzure';
import { ViewContainerTypeProperties as _ViewContainerTypeProperties } from './ContainerType/ViewContainerTypeProperties';
import { RenameContainer as _RenameContainer } from './Container/RenameContainer';
import { EditContainerDescription as _EditContainerDescription } from './Container/EditContainerDescription';
import { RecycleContainer as _RecycleContainer } from './Container/RecycleContainer';
import { CopyContainerId as _CopyContainerId } from './Container/CopyContainerId';
import { ViewContainerProperties as _ViewContainerProperties } from './Container/ViewContainerProperties';
import { CopyRecycledContainerId as _CopyRecycledContainerId } from './RecycledContainer/CopyContainerId';
import { DeleteContainer as _DeleteContainer } from './RecycledContainer/DeleteContainer';
import { RenameApp as _RenameApp } from './App/RenameApp';

export namespace Commands {
  export const SignIn = _SignIn;
  export const SignOut = _SignOut;
  export const CancelSignIn = _CancelSignIn;
  export const CreateTrialContainerType = _CreateTrialContainerType;
  export const CreatePaidContainerType = _CreatePaidContainerType;
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
  export const ViewContainerTypeProperties = _ViewContainerTypeProperties;
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
  export const CopySecret = _CopySecret;
  export const GetLocalAdminConsent = _GetLocalAdminConsent;
  export const ForgetAppSecret = _ForgetAppSecret;
  export const ViewInAzure = _ViewInAzure;
  export const RenameApp = _RenameApp;

  // Container Commands
  export const RenameContainer = _RenameContainer;
  export const EditContainerDescription = _EditContainerDescription;
  export const RecycleContainer = _RecycleContainer;
  export const CopyContainerId = _CopyContainerId;
  export const ViewContainerProperties = _ViewContainerProperties;

  // Recycled Container Commands
  export const CopyRecycledContainerId = _CopyRecycledContainerId;
  export const DeleteContainer = _DeleteContainer;
}
