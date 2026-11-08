import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=createRequire(require.resolve('next/package.json'))('sharp');
test('local brand asset remains bounded; logo is confined to login',async()=>{
  const root=new URL('../',import.meta.url);
  const original=await sharp(fs.readFileSync(new URL('public/branding/logo-ruwang-arsip.png',root))).metadata();
  const bytes=fs.readFileSync(new URL('public/branding/logo-ruwang-arsip-small.webp',root));
  const small=await sharp(bytes).metadata();
  assert.equal(small.format,'webp');assert.equal(small.width,256);assert.ok(bytes.length<=32768);
  assert.ok(Math.abs(small.height-small.width*original.height/original.width)<=1);
  const shell=fs.readFileSync(new URL('components/reviews/review-shell.tsx',root),'utf8');
  assert.doesNotMatch(shell,/<Image|\/branding\/|Ruang kerja pemeriksa/);
  const login=fs.readFileSync(new URL('app/login/page.tsx',root),'utf8');
  assert.match(login,/src="\/branding\/logo-ruwang-arsip.png"/);
});
