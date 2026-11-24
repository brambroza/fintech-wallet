import type { Config } from "./config.js";
import type { Db } from "./db.js";
import type { Providers } from "./providers/index.js";

export interface AppCtx {
  cfg: Config;
  db: Db;
  providers: Providers;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: { id: string; deviceId: string };
  }
}
