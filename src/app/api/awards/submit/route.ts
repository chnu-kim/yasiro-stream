import { handleSubmit } from "@/lib/awards/api";
import { getAwardsDeps } from "../_deps";

export async function POST(req: Request) {
  return handleSubmit(req, await getAwardsDeps());
}
