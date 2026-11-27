import { handlePoster } from "@/lib/awards/api";
import { getAwardsDeps } from "../_deps";

export async function GET(req: Request) {
  return handlePoster(req, { ...(await getAwardsDeps()), fetch: (i, init) => fetch(i, init) });
}
