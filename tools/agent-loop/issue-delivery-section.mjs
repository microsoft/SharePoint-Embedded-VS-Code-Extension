const start = '\n\n<!-- spe-feature-delivery:v1 ';
const end = '\n<!-- /spe-feature-delivery -->';
const sectionPattern = /\r?\n\r?\n<!-- spe-feature-delivery:v1 ([1-9]\d*) -->\r?\n## Feature agent delivery\r?\n(?:(?!<!--)[\s\S])*?<!-- \/spe-feature-delivery -->(?=\r?\n|$)/;

export function splitIssueDelivery(body) {
    const section = typeof body === 'string' ? sectionPattern.exec(body) : undefined;
    if (!section) return { requirements: body };
    return {
        requirements: body.slice(0, section.index) + body.slice(section.index + section[0].length),
        runId: section[1],
    };
}

export function appendIssueDelivery(requirements, runId, markdown) {
    if (!/^[1-9]\d*$/.test(runId)) throw new Error('Invalid delivery run ID.');
    return `${requirements}${start}${runId} -->\n${markdown}${end}`;
}
