import { handleRankings } from "@/lib/awards/api";
import { getAwardsDeps } from "../_deps";

export async function GET(req: Request) {
  return handleRankings(req, await getAwardsDeps());
}
