import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('dashboard SJ links load review resources on navigation, not before use',()=>{
  const shell=readFileSync(new URL('../components/reviews/review-shell.tsx',import.meta.url),'utf8');
  const dashboard=readFileSync(new URL('../app/(control)/page.tsx',import.meta.url),'utf8');
  assert.match(shell,/<Link key=\{href\} href=\{href\} prefetch=\{false\}/);
  // The dashboard now opens the exact waiting filter; icon markup is not the contract.
  assert.match(dashboard,/<Link className="control-work-card" href="\/reviews\?group=content&state=IN_REVIEW" prefetch=\{false\}>/);
  assert.match(dashboard,/<Link className="control-work-card" href="\/reviews\?group=lifecycle&state=IN_REVIEW" prefetch=\{false\}>/);
  assert.match(dashboard,/<Link className="control-work-card" href="\/monitoring" prefetch=\{false\}>/);
});
