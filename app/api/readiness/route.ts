import { checkDatabaseReadiness } from "@/src/server/database";
import { apiFailure, apiSuccess } from "@/src/server/http";

export const dynamic = "force-dynamic";
export async function GET() { try { return apiSuccess({ status: "ready", ...(await checkDatabaseReadiness()) }); } catch (error) { return apiFailure(error); } }
