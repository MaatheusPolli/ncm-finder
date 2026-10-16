import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Container } from "@ncm-finder/core";

export const rotaHealth =
  (container: Container): FastifyPluginAsyncZod =>
  async (app) => {
    app.get("/health", async () => ({ status: "ok", ...container.info }));
  };
