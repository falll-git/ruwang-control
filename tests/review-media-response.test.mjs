import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readReviewMediaResponse} from '../src/domain/review-media-response.ts';
test('review media preserves bytes, rejects HTTP/empty/declared overflow',async()=>{
  assert.deepEqual(await readReviewMediaResponse(new Response(new Uint8Array([0,1,255])),3),Buffer.from([0,1,255]));
  await assert.rejects(readReviewMediaResponse(new Response('bad',{status:404})),/BANK_MEDIA_HTTP_404/);
  await assert.rejects(readReviewMediaResponse(new Response('')),/BANK_MEDIA_EMPTY/);
  await assert.rejects(readReviewMediaResponse(new Response('x',{headers:{'content-length':'4'}}),3),/BANK_MEDIA_TOO_LARGE/);
});
test('review media caps chunked response without trusting content length',async()=>{
  let cancelled=false;
  const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(2));c.enqueue(new Uint8Array(2));},cancel(){cancelled=true;}});
  await assert.rejects(readReviewMediaResponse(new Response(body,{headers:{'content-length':'1'}}),3),/BANK_MEDIA_TOO_LARGE/);
  assert.equal(cancelled,true);
});
test('media body timeout remains effective after successful response headers',async()=>{
  const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'image/png'});res.write(Buffer.from([1]));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const controller=new AbortController();
    const response=await fetch(`http://127.0.0.1:${server.address().port}`,{signal:controller.signal});
    const timer=setTimeout(()=>controller.abort(),40);
    try{await assert.rejects(readReviewMediaResponse(response),e=>e.name==='AbortError');}finally{clearTimeout(timer);}
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
