import sharp from "sharp";
import { IntegrationUnavailableError } from "@/src/server/errors";

// Call only after the original private response has passed authorization,
// resource binding, size, MIME, checksum and signature validation.
// No public optimizer, disk cache, source URL, metadata or credentials.
export async function reviewThumbnail(body:Buffer) {
  try {
    const result=await sharp(body,{limitInputPixels:16_000_000,animated:false,failOn:"warning"})
      .rotate().resize({width:640,height:480,fit:"inside",withoutEnlargement:true})
      .webp({quality:70,effort:2}).timeout({seconds:3}).toBuffer();
    return {body:result,mime:"image/webp"};
  } catch { throw new IntegrationUnavailableError("REVIEW_THUMBNAIL_UNAVAILABLE"); }
}
