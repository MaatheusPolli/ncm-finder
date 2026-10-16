import Fastify, { type FastifyError } from "fastify";
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { Container } from "@ncm-finder/core";
import { ErroHttp, type CorpoErro } from "./errors.js";
import { rotaClassificar } from "./routes/classificar.js";
import { rotaHealth } from "./routes/health.js";

export function criarApp(container: Container, { logger = false }: { logger?: boolean } = {}) {
  // Não logar o corpo das requisições: descrições podem conter dados de clientes.
  const app = Fastify({ logger: logger && { level: "info", redact: ["req.body"] } });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler<FastifyError>((erro, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(erro)) {
      return reply.status(400).send({
        erro: {
          codigo: "ENTRADA_INVALIDA",
          mensagem: "A requisição não passou na validação.",
          detalhes: erro.validation.map((v) => ({ campo: `${erro.validationContext ?? ""}${v.instancePath.replace(/\//g, ".")}`, mensagem: v.message })),
        },
      } satisfies CorpoErro);
    }
    if (erro instanceof ErroHttp) {
      return reply.status(erro.status).send({ erro: { codigo: erro.codigo, mensagem: erro.message } } satisfies CorpoErro);
    }
    if (erro.statusCode && erro.statusCode < 500) {
      return reply.status(erro.statusCode).send({ erro: { codigo: erro.code ?? "REQUISICAO_INVALIDA", mensagem: erro.message } } satisfies CorpoErro);
    }
    req.log.error({ err: erro }, "erro não tratado");
    return reply.status(500).send({ erro: { codigo: "ERRO_INTERNO", mensagem: "Erro interno ao classificar." } } satisfies CorpoErro);
  });

  app.register(rotaHealth(container));
  app.register(rotaClassificar(container));
  return app;
}
