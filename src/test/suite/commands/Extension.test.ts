// import * as vscode from 'vscode';
// import * as fs from 'fs';
// import * as path from 'path';
// import { describe, it, afterEach, beforeEach, before, after } from 'mocha';
// import sinon from 'sinon';

// import { expect } from 'chai';
// import { SignIn } from '../../../commands/SignIn';
// import { MockExtensionContext } from '../common/stubs';
// import { activate } from '../../../extension';
// import { Account } from '../../../models/Account';
// import { CreateTrialContainerType } from '../../../commands/CreateTrialContainerType';
// import { DeleteContainerType } from '../../../commands/DeleteContainerType';
// import { ContainerTypeTreeItem } from '../../../views/treeview/development/ContainerTypeTreeItem';
// import { CloneRepo } from '../../../commands/CloneRepo';
// import { AppTreeItem } from '../../../views/treeview/development/AppTreeItem';
// import { ExportPostmanConfig } from '../../../commands/ExportPostmanConfig';
// import { CreateGuestApp } from '../../../commands/CreateGuestApp';
// import { GuestApplicationsTreeItem } from '../../../views/treeview/development/GuestApplicationsTreeItem';
// import { SignOut } from '../../../commands/SignOut';

// describe('Extension e2e tests', async () => {
//     let context: vscode.ExtensionContext;
//     const sandbox = sinon.createSandbox();

//     before(async () => {
//         context = new MockExtensionContext();
//         await activate(context);
//     });

//     after(async () => {
//         context.subscriptions.forEach(sub => sub.dispose());
//     });

//     beforeEach(async () => {
//         // Initialize extension dependencies
//         //ext.outputChannel = vscode.window.createOutputChannel("SharePoint Embedded", { log: true });

//     });

//     afterEach(function () {
//         sandbox.restore();
//     });


//     it('should handle sign-in', async () => {
//         await SignIn.run();
//         const account = Account.get();
//         expect(account).to.not.be.null;
//         expect(account!.homeAccountId).to.not.be.null;
//         expect(account!.environment).to.not.be.null;
//         expect(account!.tenantId).to.not.be.null;
//         expect(account!.username).to.not.be.null;
//         expect(account!.localAccountId).to.not.be.null;
//         expect(account!.isAdmin).to.not.be.null;
//         expect(account!.domain).to.not.be.null;
//         expect(account!.name).to.not.be.null;
//     });

//     it('should handle trial container type creation', async () => {
//         //const collectInputStub = sandbox.stub(ImportOrCreateAppQuickPick.prototype, "collectInput").resolves(UxInputStep.Next);
//         const infoWindowStub = sandbox.stub(vscode.window, "showInformationMessage") as sinon.SinonStub;
//         infoWindowStub
//             .onCall(0)
//             .resolves('Continue')
//             .onCall(1)
//             .resolves('OK')
//             .onCall(2)
//             .resolves('Copy Consent Link')
//             .onCall(3)
//             .resolves('OK')
//             .onCall(4)
//             .resolves('Continue')
//             .onCall(5)
//             .resolves('OK')
//             .onCall(6)
//             .resolves('OK')
//             .onCall(7)
//             .resolves('Copy Consent Link');

//         await CreateTrialContainerType.run();
//         const account = Account.get();
//         expect(account).to.not.be.null;
//         expect(account!.appIds).to.not.be.null;
//         expect(account!.appIds.length).to.be.greaterThan(0);
//         expect(account!.containerTypes).to.not.be.null;
//         expect(account!.containerTypes.length).to.be.equal(1);
//         expect(account!.containerTypes[0].containerTypeId).to.not.be.null;
//         expect(account!.containerTypes[0].registrationIds).to.not.be.null;
//     });

//     // it('should handle clone repo', async () => {
//     //     //const collectInputStub = sandbox.stub(ImportOrCreateAppQuickPick.prototype, "collectInput").resolves(UxInputStep.Next);
//     //     const destinationPath = path.join(__dirname, '..', '..', 'out');   
//     //     const infoWindowStub = sandbox.stub(vscode.window, "showInformationMessage") as sinon.SinonStub;
//     //     infoWindowStub
//     //         .onCall(0)
//     //         .resolves('OK');

//     //     //const fake = sinon.replace(vscode.commands.executeCommand('vscode.openFolder'), 'then', sinon.fake.returns(Promise.resolve()));

//     //     const account = Account.get();
//     //     const appTreeItemMock = new ApplicationTreeItem(account!.apps[0], account!.containerTypes[0], "", vscode.TreeItemCollapsibleState.None);
//     //     await CloneRepo.run(appTreeItemMock);

//     //     // Assert for local.settings.json
//     //     // const localSettingsPathExpected = path.join(destinationPath, 'SharePoint-Embedded-Samples', 'Samples', 'spa-azurefunction', 'packages', 'azure-functions', 'local.settings.json');
//     //     // expect(fs.existsSync(localSettingsPathExpected), 'local.settings.json should exist after cloning the repo.');

//     //     // // Assert for appsettings.json
//     //     // const appSettingsPathExpected = path.join(destinationPath, 'SharePoint-Embedded-Samples', 'Samples', 'asp.net-webservice', 'appsettings.json');
//     //     // expect(fs.existsSync(appSettingsPathExpected), 'appsettings.json should exist after cloning the repo.');

//     //     // // Assert for .env file
//     //     // const envFilePathExpected = path.join(destinationPath, 'SharePoint-Embedded-Samples', 'Samples', 'spa-azurefunction', 'packages', 'client-app', '.env');
//     //     // expect(fs.existsSync(envFilePathExpected), '.env file should exist after cloning the repo.');
//     // });

//     it('should handle Postman export', async () => {
//         const destinationPath = path.join(__dirname, '..', '..', 'out');
//         const infoWindowStub = sandbox.stub(vscode.window, "showInformationMessage") as sinon.SinonStub;
//         infoWindowStub
//             .onCall(0)
//             .resolves('OK');

//         const account = Account.get();
//         const appTreeItemMock = new AppTreeItem(account!.apps[0], account!.containerTypes[0], "", vscode.TreeItemCollapsibleState.None);
//         await ExportPostmanConfig.run(appTreeItemMock);

//         const postmanEnvironmentPath = path.join(destinationPath, `${account!.apps[0].clientId}_postman_environment.json`);
//         expect(fs.existsSync(postmanEnvironmentPath), 'postman_environmnent.json should exist after exporting the config.');
//     });

//     it('should handle guest app creation', async () => {
//         //const collectInputStub = sandbox.stub(ImportOrCreateAppQuickPick.prototype, "collectInput").resolves(UxInputStep.Next);
//         const ga = new GuestApplicationsTreeItem(Account.get()!.containerTypes[0], "", vscode.TreeItemCollapsibleState.None);
//         const infoWindowStub = sandbox.stub(vscode.window, "showInformationMessage") as sinon.SinonStub;
//         infoWindowStub
//             .onCall(0)
//             .resolves('Continue')
//             .onCall(1)
//             .resolves('OK')
//             .onCall(2)
//             .resolves('Copy Consent Link');

//         await CreateGuestApp.run(ga);
//         const account = Account.get();
//         expect(account).to.not.be.null;
//         expect(account!.containerTypes[0].guestApps).to.not.be.null;
//         expect(account!.containerTypes[0].guestAppIds).to.not.be.null;
//         expect(account!.containerTypes[0].guestAppIds.length).to.be.greaterThan(0);
//         expect(account!.containerTypes[0].guestApps.length).to.be.greaterThan(0);
//     });

//     it('should handle trial container type deletion', async () => {
//         const infoWindowStub = (sandbox.stub(vscode.window, "showInformationMessage") as sinon.SinonStub);
//         infoWindowStub
//             .onCall(0)
//             .resolves('OK');

//         const ct = new ContainerTypeTreeItem(Account.get()!.containerTypes[0], "", "", vscode.TreeItemCollapsibleState.None);
//         await DeleteContainerType.run(ct);
//         const account = Account.get();
//         expect(account).to.not.be.null;
//         expect(account!.appIds).to.not.be.null;
//         expect(account!.appIds.length).to.be.greaterThan(0);
//         expect(account!.containerTypes.length).to.be.equal(0);
//     });

//     it('should handle sign-out', async () => {
//         const infoWindowStub = (sandbox.stub(vscode.window, "showInformationMessage") as sinon.SinonStub);
//         infoWindowStub
//             .onCall(0)
//             .resolves('Continue');

//         await SignOut.run();
//         const account = Account.get();
//         expect(account).to.be.undefined;
//     });

//     it('should handle app import', async () => {
//         const infoWindowStub = (sandbox.stub(vscode.window, "showInformationMessage") as sinon.SinonStub);
//         infoWindowStub
//             .onCall(0)
//             .resolves('Continue')
//             .onCall(1)
//             .resolves('OK')
//             .onCall(2)
//             .resolves('OK')
//             .onCall(3)
//             .resolves('Copy Consent Link')
//             .onCall(4)
//             .resolves('OK');

//         await SignIn.run();
//         const account = Account.get();
//         expect(account).to.not.be.undefined;

//         await CreateTrialContainerType.run();

//         expect(account).to.not.be.null;
//         expect(account!.appIds).to.not.be.null;
//         expect(account!.appIds.length).to.be.greaterThan(0);
//         expect(account!.containerTypes).to.not.be.null;
//         expect(account!.containerTypes.length).to.be.equal(1);
//         expect(account!.containerTypes[0].containerTypeId).to.not.be.null;
//         expect(account!.containerTypes[0].registrationIds).to.not.be.null;
//     });

//     it('should handle extension clean up', async () => {
//         const infoWindowStub = (sandbox.stub(vscode.window, "showInformationMessage") as sinon.SinonStub);
//         infoWindowStub
//             .onCall(0)
//             .resolves('OK')
//             .onCall(1)
//             .resolves('Continue');

//         const ct = new ContainerTypeTreeItem(Account.get()!.containerTypes[0], "", "", vscode.TreeItemCollapsibleState.None);

//         await DeleteContainerType.run(ct);
//         let account = Account.get();
//         expect(account).to.not.be.null;
//         expect(account!.appIds).to.not.be.null;
//         expect(account!.appIds.length).to.be.greaterThan(0);
//         expect(account!.containerTypes.length).to.be.equal(0);

//         await SignOut.run();
//         account = Account.get();
//         expect(account).to.be.undefined;
//     });
// });