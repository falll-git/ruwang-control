import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeControlPath } from '../src/lib/control-navigation.ts';

test('active navigation is derived from the URL, including nested routes', () => {
  for (const [path, expected] of [['/', '/'], ['/reviews', '/reviews'], ['/reviews/id', '/reviews'], ['/monitoring', '/monitoring'], ['/monitoring/pengiriman', '/monitoring'], ['/monitoring/pemrosesan', '/monitoring'], ['/operators', '/operators'], ['/reviews-extra', null], ['/monitoring-other', null], ['/unknown', null]]) {
    assert.equal(activeControlPath(path), expected, path);
  }
});

test('authenticated shell belongs to one shared layout, not individual pages or loading states', () => {
  const layout = readFileSync(new URL('../app/(control)/layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /getCurrentOperatorSession/);
  assert.match(layout, /redirect\("\/login"\)/);
  assert.match(layout, /<AppShell operator=\{session.operator\}>/);
  for (const path of ['page.tsx', 'reviews/page.tsx', 'reviews/[reviewId]/page.tsx', 'monitoring/page.tsx', 'monitoring/pengiriman/page.tsx', 'monitoring/pemrosesan/page.tsx', 'operators/page.tsx', 'loading.tsx', 'reviews/loading.tsx', 'error.tsx']) {
    assert.doesNotMatch(readFileSync(new URL('../app/(control)/' + path, import.meta.url), 'utf8'), /AppShell/, path);
  }
  assert.doesNotMatch(readFileSync(new URL('../app/loading.tsx', import.meta.url), 'utf8'), /AppShell/);
});
