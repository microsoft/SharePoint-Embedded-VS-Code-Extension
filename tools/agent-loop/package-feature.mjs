import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function requireTestClientId(value) {
    const id = value?.trim();
    if (!id || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id) ||
        id === '00000000-0000-0000-0000-000000000000') {
        throw new Error('Set the Actions variable SPE_TEST_CLIENT_ID to the Application (client) ID of the approved Entra test app for this extension. A missing or all-zero ID cannot sign in. Do not use a client secret.');
    }
    return id.toLowerCase();
}

export function verifyBundledClientId(source, value) {
    const id = requireTestClientId(value);
    if (!source.includes(`"${id}"`) && !source.includes(`'${id}'`)) {
        throw new Error('The VSIX extension entrypoint does not contain the configured test app client ID. The VSIX will not be uploaded.');
    }
}

async function main(args) {
    const clientId = requireTestClientId(process.env.SPE_TEST_CLIENT_ID);
    if (args[0] === 'check-client-id') return;
    if (args[0] === 'verify-bundle') {
        verifyBundledClientId(await readFile(args[1], 'utf8'), clientId);
        return;
    }
    const [issue, commit, vsce, directory] = args;
    if (!/^[1-9]\d*$/.test(issue ?? '') || !/^[a-f0-9]{40}$/.test(commit ?? '') || !vsce || !directory) {
        throw new Error('Expected an issue number, reviewed commit SHA, VSCE executable path, and output directory.');
    }
    // Build in a disposable checkout. Never overwrite a real local runtime configuration.
    await writeFile('src/client.ts',
        `export const clientId = ${JSON.stringify(clientId)};\nexport const telemetryKey = "";\n`, { flag: 'wx' });
    await mkdir(directory, { recursive: true });
    const file = join(directory, `spe-issue-${issue}-${commit.slice(0, 12)}-testable.vsix`);
    execFileSync(process.execPath, [vsce, 'package', '--no-dependencies', '--out', file], { stdio: 'inherit' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main(process.argv.slice(2));
}
