import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const {SourceMapConsumer, SourceMapGenerator, SourceNode} = require('source-map-js');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const {default:nextConfig} = await import('../next.config.ts');
const flatMap = () => ({version:3, sources:['a.js'], sourcesContent:['a'], names:[], mappings:'AAAA'});
const indexedMap = (line, column = 0, map = flatMap()) => ({version:3, sections:[{offset:{line, column}, map}]});
const versionParts = value => value.split('.').map(part => Number.parseInt(part, 10));
const atLeast = (actual, minimum) => {
  const left = versionParts(actual), right = versionParts(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return true;
};

// Security fixes: GHSA-wq5f-xc86-pv6w and GHSA-68fv-2mgg-jv7q.
// These are bounded compatibility/guard regressions, not exploit or scanner bypass tests.
test('installed image and source-map packages satisfy the audited security pins', () => {
  assert.equal(packageJson.dependencies.sharp, '0.35.5');
  assert.equal(sharp.versions.sharp, packageJson.dependencies.sharp);
  assert.equal(packageJson.overrides['source-map-js'], '1.2.2');
  assert.equal(require('source-map-js/package.json').version, packageJson.overrides['source-map-js']);
  assert.ok(sharp.versions.rsvg && atLeast(sharp.versions.rsvg, '2.63.2'),
    'SVG processing must use the patched librsvg; package renaming alone is not evidence');
});

test('patched native image dependency still rasterizes a small SVG and bounds output', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12"><rect width="16" height="12" fill="#007585"/></svg>');
  const output = await sharp(svg).resize({width:8, height:8, fit:'inside', withoutEnlargement:true}).webp().toBuffer();
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 8);
  assert.equal(metadata.height, 6);
});

test('standalone tracing includes installed sharp native and shared-library assets', () => {
  assert.equal(nextConfig.output, 'standalone');
  assert.deepEqual(nextConfig.outputFileTracingIncludes?.['/*'], ['./node_modules/@img/sharp-*/lib/**/*']);
});

// Upstream guard contract: https://github.com/7rulnik/source-map-js/commit/cf76580
test('indexed source maps reject non-integer, negative and unbounded section offsets', () => {
  for (const value of [-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null, undefined, {}]) {
    for (const field of ['line', 'column']) {
      // Assign explicitly: the indexedMap helper's default parameter would
      // otherwise replace an undefined column with the valid value zero.
      const offset = {line:0, column:0};
      offset[field] = value;
      assert.throws(() => new SourceMapConsumer({version:3, sections:[{offset, map:flatMap()}]}), /offset/i);
    }
  }
  assert.throws(() => new SourceMapConsumer(indexedMap(10_000_001)), /offset/i);
});

test('indexed source maps bound cumulative nested offsets without losing valid mappings', () => {
  const valid = new SourceMapConsumer(indexedMap(5_000_000, 0, indexedMap(5_000_000)));
  const generated = [];
  valid.eachMapping(mapping => generated.push([mapping.generatedLine, mapping.generatedColumn]));
  assert.deepEqual(generated, [[10_000_001, 0]]);
  assert.throws(() => new SourceMapConsumer(indexedMap(5_000_000, 0, indexedMap(5_000_000, 0, indexedMap(5_000_000)))), /offset/i);
});

test('nested indexed source-map sources are read once instead of exponential traversal', () => {
  let nested = flatMap();
  for (let depth = 0; depth < 12; depth += 1) nested = indexedMap(0, 0, nested);
  const consumer = new SourceMapConsumer(nested);
  // Instrument the same innermost consumer getter as the upstream regression,
  // rather than the raw map, which is only read during construction.
  let innermost = consumer;
  for (let depth = 0; depth < 12; depth += 1) innermost = innermost._sections[0].consumer;
  const sources = innermost.sources;
  let reads = 0;
  Object.defineProperty(innermost, 'sources', {get() { reads += 1; return sources; }});
  assert.deepEqual(consumer.sources, ['a.js']);
  assert.equal(reads, 1);
});

test('normal source-map generation and SourceNode roundtrip remain compatible', () => {
  const generator = new SourceMapGenerator({file:'generated.js'});
  generator.addMapping({generated:{line:1, column:0}, original:{line:1, column:0}, source:'a.js'});
  generator.setSourceContent('a.js', 'const answer = 42;');
  const consumer = new SourceMapConsumer(generator.toString());
  assert.deepEqual(consumer.originalPositionFor({line:1, column:0}), {source:'a.js', line:1, column:0, name:null});
  const output = SourceNode.fromStringWithSourceMap('const answer = 42;', consumer).toStringWithSourceMap({file:'roundtrip.js'});
  assert.equal(output.code, 'const answer = 42;');
  assert.equal(new SourceMapConsumer(output.map.toString()).originalPositionFor({line:1, column:0}).source, 'a.js');
});
