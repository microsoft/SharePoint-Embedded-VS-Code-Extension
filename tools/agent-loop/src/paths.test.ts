import assert from 'node:assert/strict';
import test from 'node:test';
import {
    assertChangedPathsAllowed,
    globMatches,
    mutableScopesOverlap,
    parsePorcelainZ
} from './paths';

test('glob matching handles root and nested paths', () => {
    assert.equal(globMatches('src/**', 'src/extension.ts'), true);
    assert.equal(globMatches('**/.env', '.env'), true);
    assert.equal(globMatches('**/.env', 'ui-tests/.env'), true);
    assert.equal(globMatches('ui-tests/**/*.spec.ts', 'ui-tests/api/example.spec.ts'), true);
    assert.equal(globMatches('src/**', 'webview-ui/src/index.tsx'), false);
});

test('changed path enforcement requires both global and worker authority', () => {
    assert.doesNotThrow(() => assertChangedPathsAllowed(
        ['ui-tests/tests/recycle.spec.ts'],
        ['ui-tests/**', 'src/**'],
        ['ui-tests/tests/**'],
        ['**/.env']
    ));

    assert.throws(() => assertChangedPathsAllowed(
        ['src/services/Auth/token.ts'],
        ['src/**'],
        ['src/services/StorageExplorer/**'],
        ['**/.env']
    ), /outside its authority/);

    assert.throws(() => assertChangedPathsAllowed(
        ['ui-tests/.env'],
        ['ui-tests/**'],
        ['ui-tests/**'],
        ['**/.env']
    ), /outside its authority/);
});

test('porcelain parser includes rename source and destination', () => {
    assert.deepEqual(
        parsePorcelainZ('R  new-name.ts\0old-name.ts\0?? added.ts\0'),
        ['added.ts', 'new-name.ts', 'old-name.ts']
    );
});

test('parallel mutable scopes detect overlap', () => {
    assert.equal(
        mutableScopesOverlap(['src/services/**'], ['src/services/Auth/**']),
        true
    );
    assert.equal(
        mutableScopesOverlap(['src/services/**'], ['ui-tests/**']),
        false
    );
});
