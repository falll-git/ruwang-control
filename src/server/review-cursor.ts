import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getRuntimeConfig } from "@/src/lib/env";
import { RequestValidationError } from "@/src/server/errors";

const schema=z.object({v:z.literal(1),scope:z.string().regex(/^[a-f0-9]{64}$/),time:z.string().datetime({offset:true}),id:z.string().uuid()}).strict();
function mac(body:string) {
  // Domain separation; never expose the auth key or let a cursor authorize scope.
  return createHmac("sha256",getRuntimeConfig().CONTROL_AUTH_ENCRYPTION_KEY).update("control-review-cursor-v1\0"+body).digest();
}
export function encodeReviewCursor(scope:string,time:string,id:string):string {
  const body=Buffer.from(JSON.stringify(schema.parse({v:1,scope,time,id}))).toString("base64url");
  return body+"."+mac(body).toString("base64url");
}
export function decodeReviewCursor(value:string|undefined,scope:string) {
  if (!value) return null;
  try {
    const [body,signature,...extra]=value.split(".");
    if(!body||!signature||extra.length||!/^[A-Za-z0-9_-]+$/.test(body)||!/^[A-Za-z0-9_-]{43}$/.test(signature))throw Error();
    const signed=Buffer.from(signature,"base64url"),expected=mac(body);
    if(signed.toString("base64url")!==signature||signed.length!==expected.length||!timingSafeEqual(signed,expected))throw Error();
    const parsed=schema.parse(JSON.parse(Buffer.from(body,"base64url").toString("utf8")));
    if(parsed.scope!==scope)throw Error();return parsed;
  }catch{throw new RequestValidationError("REVIEW_CURSOR_INVALID");}
}
