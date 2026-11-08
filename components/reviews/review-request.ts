import type { z } from "zod";
export class ReviewRequestError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export async function readReviewResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body = await response.json().catch(() => { throw new ReviewRequestError(response.status, "INVALID_RESPONSE", "Respons belum dapat dipastikan. Tekan Refresh."); });
  if(!response.ok&&body?.error?.code==="CSRF_REJECTED")throw new ReviewRequestError(response.status,"CSRF_REJECTED","Sesi keamanan berubah. Periksa kembali pengajuan sebelum mencoba lagi.");
  if (!response.ok) throw new ReviewRequestError(response.status, body?.error?.code || "REQUEST_FAILED", response.status === 401 ? "Sesi berakhir. Masuk kembali." : response.status === 403 ? "Anda tidak memiliki akses untuk tindakan ini." : response.status === 409 ? "Data atau keputusan sudah berubah. Tekan Refresh." : response.status === 400 ? "Permintaan tidak sesuai. Periksa filter atau tekan Refresh." : "Data belum dapat dimuat. Coba lagi.");
  const parsed = schema.safeParse(body?.data);
  if (!parsed.success) throw new ReviewRequestError(response.status, "INVALID_RESPONSE", "Respons belum dapat dipastikan. Tekan Refresh.");
  return parsed.data;
}
