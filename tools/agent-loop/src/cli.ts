import { appendFileSync } from 'node:fs';
import {
    createExecutionPlan,
    runContract,
    validateContractCommand,
    type ImplementationStage
} from './orchestrator';
import { describeImplementationFailure } from './implementationDiagnostics';

let stage: ImplementationStage = 'contract';
const diagnosticsFile = process.env.AGENT_LOOP_DIAGNOSTICS_FILE;

function recordDiagnostic(message: string): void {
    if (diagnosticsFile) {
        appendFileSync(diagnosticsFile, `${message}\n`, 'utf8');
    }
}

async function main(): Promise<void> {
    const [command, contractPath] = process.argv.slice(2);

    if (!command || !contractPath || !['validate', 'plan', 'run'].includes(command)) {
        printUsage();
        process.exitCode = 1;
        return;
    }

    if (command === 'validate') {
        const loaded = await validateContractCommand(contractPath);
        console.log(`Valid contract: ${loaded.contract.taskId}`);
        return;
    }

    if (command === 'plan') {
        console.log(JSON.stringify(await createExecutionPlan(contractPath), null, 2));
        return;
    }

    const result = await runContract({ contractPath, onStage: value => {
        stage = value;
        recordDiagnostic(`Feature agent stage: ${value}`);
    } });
    if (diagnosticsFile && result.phase !== 'awaiting-human-acceptance') {
        const reason = result.errors.includes('Required validation still fails after repass budget')
            ? 'Required validation did not pass within the retry budget.'
            : 'Independent review did not approve the change.';
        recordDiagnostic(`Feature agent blocked: ${reason}`);
        process.exitCode = 2;
        return;
    }
    console.log(JSON.stringify({
        runId: result.runId,
        taskId: result.taskId,
        phase: result.phase,
        model: result.sdkRuntime.model,
        integrationBranch: result.integrationBranch,
        integratedCommit: result.integratedCommit,
        artifactsDir: result.artifactsDir,
        errors: result.errors
    }, null, 2));

    if (result.phase !== 'awaiting-human-acceptance') {
        process.exitCode = 2;
    }
}

function printUsage(): void {
    console.error([
        'Usage:',
        '  npm run agent:validate -- <contract.json>',
        '  npm run agent:plan -- <contract.json>',
        '  npm run agent:run -- <contract.json>'
    ].join('\n'));
}

main().catch(error => {
    process.exitCode = 1;
    if (diagnosticsFile) {
        recordDiagnostic(describeImplementationFailure(stage, error));
    } else {
        console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    }
});
