import { criarApp } from "./app.js";
import { join } from "node:path";
import { carregarEnv, criarContainer } from "@ncm-finder/core";

carregarEnv(join(import.meta.dirname, "..", "..", "..", ".env"));
const container = await criarContainer(process.env.DATA_DIR ?? join(import.meta.dirname, "..", "..", "..", "data"));
const app = criarApp(container, { logger: true });
const porta = Number(process.env.PORT ?? 3333);

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.once(sinal, async () => {
    await app.close();
    await container.fechar();
    process.exit(0);
  });
}

await app.listen({ port: porta, host: process.env.HOST ?? "127.0.0.1" });
app.log.info(container.info, "NCM Finder API pronta");
