import * as vscode from 'vscode';
import { describe, it, afterEach, beforeEach, before, after } from 'mocha';
import sinon from 'sinon';

import { expect } from 'chai';
import { SignIn } from '../../../commands/SignIn';
import { MockExtensionContext } from '../common/stubs';
import { activate } from '../../../extension';
import { Account } from '../../../models/Account';

describe('Sign In', async () => {
    let context: vscode.ExtensionContext;

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
        sinon.restore();
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

    it('should handle sign-in failure', () => {
    });
});