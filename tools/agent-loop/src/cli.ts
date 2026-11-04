import {
    createExecutionPlan,
    runContract,
    validateContractCommand
} from './orchestrator';

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

    const result = await runContract({ contractPath });
    console.log(JSON.stringify({
        runId: result.runId,
        taskId: result.taskId,
        phase: result.phase,
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
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
});
