/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

export abstract class TelemetryEvent {
    protected _name: string;
    protected _description: string;
    protected _properties?: {
        [key: string]: string
    };
    protected _measurements?: {
        [key: string]: number
    };

    public constructor(name: string, description: string, properties?: { [key: string]: string }, measurements?: { [key: string]: number }) {
        this._name = name;
        this._description = description;
        this._properties = properties;
        this._measurements = measurements;
    }

    public get name(): string {
        return this._name;
    }

    public get properties(): {
        [key: string]: string
    } {
        return {
            ...this._properties,
            description: this._description,
        };
    }

    public addProperty(key: string, value: string): void {
        if (!this._properties) {
            this._properties = {};
        }
        this._properties[key] = value;
    }
}

export abstract class TelemetryErrorEvent extends TelemetryEvent {
    protected _error: any;
    protected stack ? : string | undefined;

    public constructor(name: string, description: string, error: any, properties?: { [key: string]: string }, measurements?: { [key: string]: number }) {
        super(name, description, properties, measurements);
        this._error = error;
    }
    
    public get properties(): {
        [key: string]: string
    } {
        return {
            ...super.properties,
            error: this._error,
        };
    }
}

// Usage Models

export class CreateTrialContainerTypeEvent extends TelemetryEvent {
    public constructor() {
        const name = "CreateTrialContainerType";
        const description = "Trial Container Type created successfully.";
        super(name, description);
        this._properties = {
            ...super.properties,
            language: vscode.env.language
        };
    }
}

export class CreateContainerEvent extends TelemetryEvent {
    public constructor() {
        const name = "CreateContainer";
        const description = "Container created successfully.";
        super(name, description);
        this._properties = {
            ...super.properties,
            language: vscode.env.language
        };
    }
}

export class DeleteTrialContainerType extends TelemetryEvent {
    public constructor() {
        const name = "DeleteTrialContainerType";
        const description = "Trial Container Type deleted successfully.";
        super(name, description);
        this._properties = {
            ...super.properties,
            language: vscode.env.language
        };
    }
}


export class SignInEvent extends TelemetryEvent {
    public constructor() {
        const name = "SignIn";
        const description = "User signed in successfully.";
        super(name, description);
        this._properties = {
            ...super.properties,
            language: vscode.env.language
        };
    }
}

export class SignOutEvent extends TelemetryEvent {
    public constructor() {
        const name = "SignOut";
        const description = "User signed out successfully.";
        super(name, description);
        this._properties = {
            ...super.properties,
            language: vscode.env.language
        };
    }
}

// API Models

export class CreateTrialContainerTypeApiSuccess extends TelemetryEvent {
    public constructor(response: any) {
        const name = "CreateTrialContainerTypeApiSuccess";
        const description = "Trial Container Type creation API succeeded.";
        super(name, description);
        this._properties = {
            ...super.properties,
            responseCode: response.status,
            spRequestGuid: response.headers["sprequestguid"],
            language: vscode.env.language
        };
    }
}

export class CreateTrialContainerTypeApiFailure extends TelemetryErrorEvent {
    public constructor(error: any, response: any) {
        const name = "CreateTrialContainerTypeApiFailure";
        const description = "Trial Container Type creation API failed.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            responseCode: response.status,
            responseMessage: response.data && 
                response.data['odata.error'] && 
                response.data['odata.error'].message ? 
                response.data['odata.error'].message.value : response.statusText,
            spRequestGuid: response.headers["sprequestguid"],
            language: vscode.env.language
        };
    }
}

export class DeleteTrialContainerTypeApiSuccess extends TelemetryEvent {
    public constructor(response: any) {
        const name = "DeleteTrialContainerTypeApiSuccess";
        const description = "Trial Container Type deletion API succeeded.";
        super(name, description);
        this._properties = {
            ...super.properties,
            responseCode: response.status,
            spRequestGuid: response.headers["sprequestguid"],
            language: vscode.env.language
        };
    }
}

export class DeleteTrialContainerTypeApiFailure extends TelemetryErrorEvent {
    public constructor(error: any, response: any) {
        const name = "DeleteContainerTypeApiFailure";
        const description = "Trial Container Type deletion API failed.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            responseCode: response.status,
            responseMessage: response.data && 
                response.data['odata.error'] && 
                response.data['odata.error'].message ? 
                response.data['odata.error'].message.value : response.statusText,
            spRequestGuid: response.headers["sprequestguid"],
            language: vscode.env.language
        };
    }
}

export class RegisterTrialContainerTypeApiSuccess extends TelemetryEvent {
    public constructor(response: any) {
        const name = "ReigsterTrialContainerTypeApiSuccess";
        const description = "Register Trial Container Type API succeeded.";
        super(name, description);
        this._properties = {
            ...super.properties,
            responseCode: response.status,
            spRequestGuid: response.headers["sprequestguid"],
            language: vscode.env.language
        };
    }
}

export class RegisterTrialContainerTypeApiFailure extends TelemetryErrorEvent {
    public constructor(error: any, response: any) {
        const name = "RegisterTrialContainerTypeApiFailure";
        const description = "Register Trial Container Type API failed.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            responseCode: response.status,
            responseMessage: response.data && 
                response.data.error && 
                response.data.error.message ? 
                response.data.error.message : response.statusText,
            spRequestGuid: response.headers["sprequestguid"],
            language: vscode.env.language
        };
    }
}

// Error Models 

export class AppCreationFailure extends TelemetryErrorEvent {
    public constructor(error: any) {
        const name = "AppCreationFailure";
        const description = "Application creation failed.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            UxError: "true",
            language: vscode.env.language
        };
    }
}

export class AppImportFailure extends TelemetryErrorEvent {
    public constructor(error: any) {
        const name = "AppImportFailure";
        const description = "Application import failed.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            UxError: "true",
            language: vscode.env.language
        };
    }
}

export class CancelSignInFailure extends TelemetryErrorEvent {
    public constructor(error: any) {
        const name = "CancelSignInFailure";
        const description = "Failed to cancel sign in flow.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            UxError: "true",
            language: vscode.env.language
        };
    }
}


export class CreateContainerFailure extends TelemetryErrorEvent {
    public constructor(error: any) {
        const name = "CreateContainerFailure";
        const description = "Unable to create container object.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            UxError: "true",
            language: vscode.env.language
        };
    }
}

export class ExportPostmanConfigFailure extends TelemetryErrorEvent {
    public constructor(error: any) {
        const name = "ExportPostmanConfigFailure";
        const description = "Failed to download Postman environment.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            UxError: "true",
            language: vscode.env.language
        };
    }
}   
      
export class GuestAppRegisterContainerTypeFailure extends TelemetryErrorEvent {
    public constructor(error: any) {
        const name = "GuestAppRegisterContainerTypeFailure";
        const description = "Unable to register guest app.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            UxError: "true",
            language: vscode.env.language
        };
    }
}

export class GuestAppCreateOrImportAppFailure extends TelemetryErrorEvent {
    public constructor(error: any) {
        const name = "GuestAppCreateOrImportAppFailure";
        const description = "Unable to create or import Azure AD application.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            UxError: "true",
            language: vscode.env.language
        };
    }
}

export class RepoCloneFailure extends TelemetryErrorEvent {
    public constructor(error: any) {
        const name = "RepoCloneFailure";
        const description = "Failed to clone the repository.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            UxError: "true",
            language: vscode.env.language
        };
    }
}

export class TrialContainerTypeCreationFailure extends TelemetryErrorEvent {
    public constructor(error: any) {
        const name = "TrialContainerTypeCreationFailure";
        const description = "Trial Container Type creation failed.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            UxError: "true",
            language: vscode.env.language
        };
    }
}

export class TrialContainerTypeDeletionFailure extends TelemetryErrorEvent {
    public constructor(error: any) {
        const name = "TrialContainerTypeDeletionFailure";
        const description = "Error deleting Trial Container Type.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            UxError: "true",
            language: vscode.env.language
        };
    }
}

export class TrialContainerTypeFetchFailure extends TelemetryErrorEvent {
    public constructor(error: any) {
        const name = "TrialContainerTypeFetchFailure";
        const description = "Error fetching Free Trial Container Type.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            UxError: "true",
            language: vscode.env.language
        };
    }
}

export class TrialContainerTypeImportFailure extends TelemetryErrorEvent {
    public constructor(error: any) {
        const name = "TrialContainerTypeImportFailure";
        const description = "Error importing Free Trial Container Type.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            UxError: "true",
            language: vscode.env.language
        };
    }
}

export class TrialContainerTypeRegistrationFailure extends TelemetryErrorEvent {
    public constructor(error: any) {
        const name = "TrialContainerTypeRegistrationFailure";
        const description = "Unable to register Free Trial Container Type.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            UxError: "true",
            language: vscode.env.language
        };
    }
}

export class SignInFailure extends TelemetryErrorEvent {
    public constructor(error: any) {
        const name = "SignInFailure";
        const description = "User failed to sign in.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            UxError: "true",
            language: vscode.env.language
        };
    }
}

export class SignOutFailure extends TelemetryErrorEvent {
    public constructor(error: any) {
        const name = "SignOutFailure";
        const description = "User failed to sign out.";
        super(name, description, error);
        this._properties = {
            ...super.properties,
            UxError: "true",
            language: vscode.env.language
        };
    }
}



