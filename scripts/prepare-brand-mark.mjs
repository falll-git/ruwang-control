// Deterministic size/format derivative of the existing logo, never a redesign.
// Run manually when the original changes; normal requests serve the small asset.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const sharp=createRequire(require.resolve('next/package.json'))('sharp');
const source=new URL('../public/branding/logo-ruwang-arsip.png',import.meta.url);
const target=new URL('../public/branding/logo-ruwang-arsip-small.webp',import.meta.url);
const bytes=await readFile(source);
const image=sharp(bytes);
const original=await image.metadata();
if(original.format!=='png'||!original.width||!original.height)throw Error('Expected original PNG logo');
const output=await image.resize({width:256,withoutEnlargement:true}).webp({quality:90,effort:6}).toBuffer();
if(output.length>32768)throw Error('Brand mark exceeds 32 KiB budget');
await writeFile(target,output);
console.log(JSON.stringify({originalSha256:createHash('sha256').update(bytes).digest('hex'),sourceBytes:bytes.length,outputBytes:output.length,width:256}));
