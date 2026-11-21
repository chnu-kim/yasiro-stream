import { handleDraw } from "@/lib/awards/api";
import { getAwardsDeps } from "../_deps";

export async function POST(req: Request) {
  return handleDraw(req, await getAwardsDeps());
}
