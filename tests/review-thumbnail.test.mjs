import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('@/')?pathToFileURL(process.cwd()+'/'+specifier.slice(2)+'.ts').href:specifier,context);}});
const {reviewThumbnail}=await import('../src/server/review-thumbnail.ts');
test('private thumbnail bounds portrait landscape transparent media without upscaling or metadata',async()=>{
  for(const [width,height] of [[1024,768],[768,1024],[32,32]]) {
    const source=await sharp({create:{width,height,channels:4,background:{r:20,g:50,b:70,alpha:.5}}}).png().withMetadata().toBuffer();
    const image=await reviewThumbnail(source),info=await sharp(image.body).metadata();
    assert.equal(image.mime,'image/webp');assert.ok(info.width<=640&&info.height<=480);
    assert.ok(info.width<=width&&info.height<=height);assert.equal(info.exif,undefined);
    assert.equal(info.icc,undefined);assert.ok(info.hasAlpha);
  }
});
test('private thumbnail rejects corrupt bytes and decompression over pixel limit',async()=>{
  await assert.rejects(reviewThumbnail(Buffer.from('not-an-image')),e=>e.code==='REVIEW_THUMBNAIL_UNAVAILABLE');
  const source=await sharp({create:{width:5000,height:4000,channels:3,background:'white'}}).png().toBuffer();
  await assert.rejects(reviewThumbnail(source),e=>e.code==='REVIEW_THUMBNAIL_UNAVAILABLE');
});
test('large noisy source is reduced; original bytes remain unchanged',async()=>{
  const bytes=Buffer.alloc(1024*768*3);let seed=42;for(let i=0;i<bytes.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;bytes[i]=seed>>>24;}
  const source=await sharp(bytes,{raw:{width:1024,height:768,channels:3}}).png().toBuffer(),copy=Buffer.from(source);
  const thumbnail=await reviewThumbnail(source);
  assert.ok(thumbnail.body.length<source.length/4);assert.deepEqual(source,copy);
});
