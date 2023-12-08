/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/naming-convention */
import { SignIn as _SignIn } from './SignIn';
import { SignOut as _SignOut } from './SignOut';
import { CreateTrialContainerType as _CreateTrialContainerType } from './CreateTrialContainerType';
import { RegisterContainerType as _RegisterContainerType } from './RegisterContainerType';
import { CreateGuestApp as _CreateGuestApp } from './CreateGuestApp';
import { DeleteContainerType as _DeleteContainerType } from './DeleteContainerType';
import { RefreshContainersList as _RefreshContainersList } from './RefreshContainersList';
import { CreateContainer as _CreateContainer } from './CreateContainer';
import { CloneRepo as _CloneRepo } from './CloneRepo';
import { ExportPostmanConfig as _ExportPostmanConfig } from './ExportPostmanConfig';
import { RenameApplication as _RenameApplication } from './RenameApplication';
import { CancelSignIn as _CancelSignIn } from './CancelSignIn';

export namespace Commands {
  export const SignIn = _SignIn;
  export const SignOut = _SignOut;
  export const CancelSignIn = _CancelSignIn;
  export const CreateTrialContainerType = _CreateTrialContainerType;
  export const RegisterContainerType = _RegisterContainerType;
  export const CreateGuestApp = _CreateGuestApp;
  export const DeleteContainerType = _DeleteContainerType;
  export const RefreshContainersList = _RefreshContainersList;
  export const CreateContainer = _CreateContainer;
  export const CloneRepo = _CloneRepo;
  export const ExportPostmanConfig = _ExportPostmanConfig;
  export const RenameApplication = _RenameApplication;
}
