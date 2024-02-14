import * as vscode from 'vscode';
import { describe, it, afterEach, beforeEach, before, after } from 'mocha';
import sinon from 'sinon';

import { expect } from 'chai';
import { SignIn } from '../../../commands/SignIn';
import { MockExtensionContext } from '../common/stubs';
import { activate } from '../../../extension';
import { Account } from '../../../models/Account';
import { CreateTrialContainerType } from '../../../commands/CreateTrialContainerType';
import { DeleteContainerType } from '../../../commands/DeleteContainerType';
import { ContainerTypeTreeItem } from '../../../views/treeview/development/ContainerTypeTreeItem';

describe('Sign In', async () => {
    let context: vscode.ExtensionContext;
    const sandbox = sinon.createSandbox();

    before(async () => {
        context = new MockExtensionContext();
        await activate(context);
    });

    after(async () => {
        context.subscriptions.forEach(sub => sub.dispose());
    });

    beforeEach(async () => {
        // Initialize extension dependencies
        //ext.outputChannel = vscode.window.createOutputChannel("SharePoint Embedded", { log: true });

    });
    
    afterEach(function () {
        sandbox.restore();
    });


    it('should handle sign-in success', async () => {
        await SignIn.run();
        const account = Account.get();
        expect(account).to.not.be.null;
        expect(account!.homeAccountId).to.not.be.null;
        expect(account!.environment).to.not.be.null;
        expect(account!.tenantId).to.not.be.null;
        expect(account!.username).to.not.be.null;
        expect(account!.localAccountId).to.not.be.null;
        expect(account!.isAdmin).to.not.be.null;
        expect(account!.domain).to.not.be.null;
        expect(account!.name).to.not.be.null;
    });

    it('should handle trial container type creation', async () => {
        //const collectInputStub = sandbox.stub(ImportOrCreateAppQuickPick.prototype, "collectInput").resolves(UxInputStep.Next);
        const infoWindowStub = sandbox.stub(vscode.window, "showInformationMessage") as sinon.SinonStub;
        infoWindowStub
            .onCall(0)
            .resolves('Continue')
            .onCall(1)
            .resolves('OK')
            .onCall(2)
            .resolves('Copy Consent Link')
            .onCall(3)
            .resolves('OK')
            .onCall(4)
            .resolves('Continue')
            .onCall(5)
            .resolves('OK')
            .onCall(6)
            .resolves('OK')
            .onCall(7)
            .resolves('Copy Consent Link');

        await CreateTrialContainerType.run();
        const account = Account.get();
        expect(account).to.not.be.null;
        expect(account!.appIds).to.not.be.null;
        expect(account!.appIds.length).to.be.greaterThan(0);
        expect(account!.containerTypes).to.not.be.null;
        expect(account!.containerTypes.length).to.be.equal(1);
        expect(account!.containerTypes[0].containerTypeId).to.not.be.null;
        expect(account!.containerTypes[0].registrationIds).to.not.be.null;
    });

    it('should handle trial container type deletion', async () => {
        const infoWindowStub = (sandbox.stub(vscode.window, "showInformationMessage") as sinon.SinonStub);
        infoWindowStub
            .onCall(0)
            .resolves('OK');

        const ct = new ContainerTypeTreeItem(Account.get()!.containerTypes[0], "", "", vscode.TreeItemCollapsibleState.None);
        await DeleteContainerType.run(ct);
        const account = Account.get();
        expect(account).to.not.be.null;
        expect(account!.appIds).to.not.be.null;
        expect(account!.appIds.length).to.be.greaterThan(0);
        expect(account!.containerTypes.length).to.be.equal(0);
    });
});