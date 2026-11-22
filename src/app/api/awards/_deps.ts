import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AwardsDeps } from "@/lib/awards/api";
import { cryptoRng } from "@/lib/awards/rng";

export async function getAwardsDeps(): Promise<AwardsDeps> {
  const { env } = await getCloudflareContext({ async: true });
  return {
    db: env.DB,
    env: {
      // 둘 다 Worker secret(공개 저장소에 두지 않는다). 로컬 AWARDS_SECRET은 preview --var로만 주입한다(.dev.vars에 넣지 않는다)
      ADMIN_CHANNEL_IDS: env.ADMIN_CHANNEL_IDS ?? process.env.ADMIN_CHANNEL_IDS,
      AWARDS_SECRET: env.AWARDS_SECRET ?? process.env.AWARDS_SECRET,
    },
    now: () => Math.floor(Date.now() / 1000),
    uuid: () => crypto.randomUUID(),
    rng: cryptoRng(),
    log: (message) => console.error(message),
  };
}
