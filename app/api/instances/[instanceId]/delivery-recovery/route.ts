import type {NextRequest} from 'next/server';
import {z} from 'zod';
import {recoveryInputSchema} from '@/src/domain/delivery-recovery';
import {deliveryRecovery} from '@/src/server/delivery-recovery';
import {requireRequestOperatorSession} from '@/src/server/auth/current-session';
import {verifyCsrfToken} from '@/src/server/auth/service';
import {requireJsonAndSameOrigin} from '@/src/server/auth/request';
import {getRuntimeConfig} from '@/src/lib/env';
import {RequestValidationError} from '@/src/server/errors';
import {apiSuccess,apiFailure} from '@/src/server/http';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest,context:{params:Promise<{instanceId:string}>}) {
  const requestId=crypto.randomUUID();
  try {
    requireJsonAndSameOrigin(request,getRuntimeConfig());
    const actor=await requireRequestOperatorSession(request,requestId);verifyCsrfToken(actor,request.headers.get('x-csrf-token'));
    const params=await context.params,id=z.string().uuid().safeParse(params.instanceId);
    const reader=request.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
    try{if(!reader)throw new RequestValidationError('RECOVERY_INPUT_INVALID');
      while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096)throw new RequestValidationError('RECOVERY_INPUT_TOO_LARGE');chunks.push(part.value);}
    }finally{await reader?.cancel();}
    let raw:unknown;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new RequestValidationError('RECOVERY_INPUT_INVALID');}
    const input=recoveryInputSchema.safeParse(raw);
    if(!id.success||!input.success)throw new RequestValidationError('RECOVERY_INPUT_INVALID');
    return apiSuccess(await deliveryRecovery(actor,id.data,input.data));
  }catch(error){return apiFailure(error,requestId);}
}
