import { randomUUID } from 'node:crypto';
import { ProcessOptions, ProcessResult, runProcess, runShellCommand } from './process';

export async function runValidationCommand(
    command: string,
    options: ProcessOptions
): Promise<ProcessResult> {
    const image = process.env.AGENT_LOOP_VALIDATION_IMAGE;
    if (!image) {
        return runShellCommand(command, options);
    }

    if (!/^sha256:[a-f0-9]{64}$/.test(image)) {
        throw new Error('Validation requires a local Docker image ID.');
    }
    const name = `spe-validation-${randomUUID()}`;
    const env = { ...process.env };
    delete env.COPILOT_GITHUB_TOKEN;
    delete env.GH_TOKEN;
    delete env.GITHUB_TOKEN;
    // Checks can execute generated code. Give the container a scratch copy, not the runner's credentials or workspace.
    const args = [
        'run', '--rm', '--name', name, '--pull=never', '--network=none', '--read-only',
        '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user=1000:1000',
        '--memory=5g', '--pids-limit=512', '--shm-size=512m',
        '--tmpfs', '/scratch:rw,exec,size=2g,mode=1777', '--tmpfs', '/tmp:rw,exec,size=1g,mode=1777',
        '--mount', `type=bind,source=${options.cwd},target=/input,readonly`,
        '--env', 'HOME=/scratch', '--env', 'CI=true', '--env', 'npm_config_offline=true',
        '--entrypoint', '/bin/bash', image, '-euo', 'pipefail', '-c',
        'mkdir /scratch/project; tar -C /input --exclude=./.git -cf - . | tar -C /scratch/project -xf -; ' +
        'cd /scratch/project; exec /bin/bash -c "$1"',
        'spe-validation', command
    ];

    try {
        return await runProcess('docker', args, { ...options, env });
    } finally {
        await runProcess('docker', ['rm', '-f', name], { cwd: options.cwd, env, timeoutMs: 15_000 });
    }
}
