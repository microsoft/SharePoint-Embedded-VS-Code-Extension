import { execFileSync, spawn } from 'node:child_process';
import { existsSync, statSync, truncateSync } from 'node:fs';
import { resolve } from 'node:path';

function displayNumber(server) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Xvfb did not start.')), 10_000);
        const fail = () => { clearTimeout(timer); reject(new Error('Xvfb could not start.')); };
        server.once('error', fail);
        server.once('exit', fail);
        let output = '';
        server.stdio[3].setEncoding('utf8').on('data', chunk => {
            output += chunk;
            if (!output.includes('\n')) return;
            clearTimeout(timer);
            if (!/^\d+\n$/.test(output)) return reject(new Error('Xvfb returned an invalid display number.'));
            resolve(output.trim());
        });
    });
}

const task = process.env.SPE_UX_SCREENSHOT_TASK;
if (!/^github-issue-[1-9]\d*$/.test(task ?? '')) throw new Error('Invalid desktop screenshot task.');
if (existsSync(`src/test/native/${task}.ts`)) {
    const executable = '/desktop-vscode/code';
    const screenshot = process.env.SPE_UX_SCREENSHOT_PATH;
    if (!existsSync(executable) || !screenshot) throw new Error('Desktop screenshot runtime is unavailable.');

    execFileSync('npm', ['run', 'test-compile'], { stdio: 'inherit' });
    const scenario = resolve(`out/test/native/${task}.js`);
    if (!existsSync(scenario)) throw new Error('Desktop screenshot scenario did not compile.');
    truncateSync(screenshot, 0);

    const runner = [
        'require("@vscode/test-electron").runTests({',
        '  vscodeExecutablePath: process.argv[1],',
        '  extensionDevelopmentPath: process.cwd(),',
        '  extensionTestsPath: process.argv[2],',
        '  launchArgs: ["--no-sandbox", "--disable-gpu", "--disable-updates", "--disable-telemetry",',
        '    "--skip-welcome", "--skip-release-notes", "--window-size=1280,800",',
        '    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=9222"]',
        '}).catch(error => { console.error(error); process.exitCode = 1; });'
    ].join('\n');
    const server = spawn('Xvfb', ['-displayfd', '3', '-screen', '0', '1280x800x24', '-nolisten', 'tcp', '-ac'],
        { stdio: ['ignore', 'ignore', 'inherit', 'pipe'] });
    try {
        const display = await displayNumber(server);
        execFileSync(process.execPath, ['-e', runner, executable, scenario], {
            env: { ...process.env, DISPLAY: `:${display}` }, stdio: 'inherit', timeout: 180_000
        });
    } finally {
        server.kill();
    }
    if (statSync(screenshot).size === 0) throw new Error('The desktop scenario did not capture a screenshot.');
}
