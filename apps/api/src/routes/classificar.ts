import { EntradaClassificacaoSchema, K_MAXIMO, K_PADRAO } from "@ncm-finder/core";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ErroHttp } from "../errors.js";
import type { Container } from "@ncm-finder/core";

const QuerySchema = z.object({
  modo: z.enum(["vetorial", "vetorial+llm"]).default("vetorial+llm"),
  k: z.coerce.number().int().min(1).max(K_MAXIMO).default(K_PADRAO),
});

export const rotaClassificar =
  (container: Container): FastifyPluginAsyncZod =>
  async (app) => {
    app.post("/classificar", { schema: { body: EntradaClassificacaoSchema, querystring: QuerySchema } }, async (req) => {
      if (req.query.modo === "vetorial+llm" && !container.llmDisponivel) {
        throw new ErroHttp(422, "LLM_INDISPONIVEL", "Modo vetorial+llm indisponível: configure ANTHROPIC_API_KEY ou use ?modo=vetorial.");
      }
      return container.classificar(req.body, { modo: req.query.modo, k: req.query.k });
    });
  };
