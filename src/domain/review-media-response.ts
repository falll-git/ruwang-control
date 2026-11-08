// Bound both headers and streaming bytes. The caller keeps its AbortSignal
// timeout active until this promise completes, not merely until headers arrive.
export async function readReviewMediaResponse(response: Response, maximum = 10 * 1024 * 1024): Promise<Buffer> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`BANK_MEDIA_HTTP_${response.status}`);
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) {
    await response.body?.cancel();
    throw new Error("BANK_MEDIA_TOO_LARGE");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("BANK_MEDIA_EMPTY");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error("BANK_MEDIA_TOO_LARGE");
      }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new Error("BANK_MEDIA_EMPTY");
  return Buffer.concat(chunks, size);
}
