import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { AppCtx } from "./context.js";
import { AppError } from "./lib/errors.js";
import authRoutes from "./routes/auth.js";
import kycRoutes from "./routes/kyc.js";
import walletRoutes from "./routes/wallet.js";
import sandboxRoutes from "./routes/sandbox.js";

export async function buildApp(ctx: AppCtx) {
  const app = Fastify({
    logger:
      ctx.cfg.NODE_ENV === "test"
        ? false
        : {
            level: ctx.cfg.NODE_ENV === "production" ? "info" : "debug",
            redact: ["req.headers.authorization", "req.body.pin", "req.body.code", "req.body.refreshToken"],
          },
    trustProxy: true,
    bodyLimit: 12 * 1024 * 1024,
  });

  await app.register(helmet);
  await app.register(cors, { origin: ctx.cfg.CORS_ORIGIN === "*" ? true : ctx.cfg.CORS_ORIGIN.split(",") });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  app.setErrorHandler((e, req, reply) => {
    if (e instanceof AppError) {
      return reply.status(e.status).send({ error: { code: e.code, message: e.message, ...e.details } });
    }
    if ((e as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send({ error: { code: "RATE_LIMITED", message: "Too many requests" } });
    }
    req.log.error(e);
    return reply.status(500).send({ error: { code: "INTERNAL", message: "Something went wrong" } });
  });

  app.get("/health", async () => {
    await ctx.db.query("SELECT 1");
    return { ok: true, sandbox: ctx.cfg.SANDBOX };
  });

  await app.register(async (s) => authRoutes(s, ctx), { prefix: "/v1" });
  await app.register(async (s) => kycRoutes(s, ctx), { prefix: "/v1" });
  await app.register(async (s) => walletRoutes(s, ctx), { prefix: "/v1" });
  if (ctx.cfg.SANDBOX) await app.register(async (s) => sandboxRoutes(s, ctx), { prefix: "/v1" });

  return app;
}
