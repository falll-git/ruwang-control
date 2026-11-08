import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source/document consistency only: never import a route, auth service or DB.
const source = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const document = source('docs/control-sj-current.md');
const route = source('app/api/operators/route.ts');
const page = source('app/(control)/operators/page.tsx');
const rows = document.split(/\r?\n/).filter(line => /^\|\s*\/operators\s*\|/.test(line));
assert.equal(rows.length, 1, 'one active operator page/API row is required');
const operatorRow = rows[0];
const exportedMethods = [...route.matchAll(/\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g)]
  .map(match => match[1]).sort();

function assertDocumentedMethods(row, methods) {
  const documented = [...row.matchAll(/\b([A-Z]+(?:\/[A-Z]+)*)\s+\/api\/operators\b/g)]
    .flatMap(match => match[1].split('/')).sort();
  assert.deepEqual(documented, methods, 'documented operator methods must match explicit route exports');
}

test('operator page/API map documents the existing POST create route only', () => {
  assert.deepEqual(exportedMethods, ['POST']);
  assertDocumentedMethods(operatorRow, exportedMethods);
  assert.match(operatorRow, /POST \/api\/operators untuk membuat akun/);
  assert.match(operatorRow, /sesi server dan CSRF/);
  assert.match(route, /requireRequestOperatorSession\(request, requestId\)/);
  assert.match(route, /verifyCsrfToken\(actor, request\.headers\.get\("x-csrf-token"\)\)/);
});

test('operator documentation check rejects the old nonexistent GET/POST claim', () => {
  const oldRow = '| /operators | Dialog nama/username/password; GET/POST /api/operators, sesi server dan CSRF |';
  assert.throws(() => assertDocumentedMethods(oldRow, exportedMethods), {
    name: 'AssertionError',
    message: /documented operator methods must match explicit route exports/,
  });
});

test('operator directory is documented as authenticated SSR, not a GET API', () => {
  assert.match(operatorRow, /direktori SSR melalui listManagedOperators\(session\)/);
  assert.match(page, /const session = await getCurrentOperatorSession\(\)/);
  assert.match(page, /if \(!session\) redirect\("\/login"\)/);
  assert.match(page, /const directory = await listManagedOperators\(session\)/);
  assert.match(page, /<OperatorManagementClient initial=\{directory\}/);
});
