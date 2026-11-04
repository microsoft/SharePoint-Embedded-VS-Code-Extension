import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

const providerId = 'sharepointEmbedded.speMcp';

export function registerMcpServerProvider(
    context: vscode.ExtensionContext,
    outputChannel: vscode.LogOutputChannel
): void {
    const serverPath = context.asAbsolutePath(path.join('out', 'mcp', 'launcher.cjs'));

    const provider: vscode.McpServerDefinitionProvider = {
        provideMcpServerDefinitions: () => {
            if (!fs.existsSync(serverPath)) {
                outputChannel.error(`[McpServerProvider] Bundled server not found at ${serverPath}`);
                return [];
            }

            const definition = new vscode.McpStdioServerDefinition(
                vscode.l10n.t('SharePoint Embedded'),
                process.execPath,
                [serverPath, 'start'],
                { ELECTRON_RUN_AS_NODE: '1' },
                context.extension.packageJSON.version
            );

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                definition.cwd = workspaceFolder.uri;
            }

            return [definition];
        }
    };

    context.subscriptions.push(
        vscode.lm.registerMcpServerDefinitionProvider(providerId, provider)
    );
    outputChannel.info(`[McpServerProvider] Registered bundled server at ${serverPath}`);
}
