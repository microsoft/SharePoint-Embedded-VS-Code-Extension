import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [issue, commit, vsce, directory] = process.argv.slice(2);
const clientId = process.env.SPE_TEST_CLIENT_ID || '00000000-0000-0000-0000-000000000000';
if (!/^[1-9]\d*$/.test(issue ?? '') || !/^[a-f0-9]{40}$/.test(commit ?? '') || !vsce || !directory) {
    throw new Error('Expected an issue number, reviewed commit SHA, VSCE executable path, and output directory.');
}
if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(clientId)) {
    throw new Error('SPE_TEST_CLIENT_ID must be a public application client ID (UUID), not a secret.');
}

// Build in a disposable checkout. Never overwrite a real local runtime configuration.
await writeFile('src/client.ts',
    `export const clientId = ${JSON.stringify(clientId)};\nexport const telemetryKey = "";\n`, { flag: 'wx' });
await mkdir(directory, { recursive: true });
const file = join(directory, `spe-issue-${issue}-${commit.slice(0, 12)}-testable.vsix`);
execFileSync(process.execPath, [vsce, 'package', '--no-dependencies', '--out', file],
    { stdio: 'inherit' });
