import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { requiresManualPublishing, reviewedDiff } from './publish-feature.mjs';

export function classifyFeatureHandoff(raw) {
    const reviewPaths = reviewedDiff(raw).filter(requiresManualPublishing).map(({ path }) => path);
    return { autoPublish: reviewPaths.length === 0, reviewPaths };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { autoPublish, reviewPaths } = classifyFeatureHandoff(readFileSync(0, 'utf8'));
    appendFileSync(process.env.GITHUB_OUTPUT, `auto-publish=${autoPublish}\n`);
    if (reviewPaths.length) {
        const files = reviewPaths.slice(0, 40).map(path => `- \`${path.replace(/[^\w./-]/g, '?')}\``);
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
            '### Files for maintainer review', '',
            'The reviewed patch and testable VSIX are built separately from PR publishing. Open the PR manually for these changes.',
            '', ...files, ...(reviewPaths.length > files.length ? ['- Additional files are listed in the patch.'] : []), '',
        ].join('\n'));
    }
}
