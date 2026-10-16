#!/usr/bin/env -S npx tsx
import { join } from "node:path";
import { carregarEnv, criarContainer } from "@ncm-finder/core";
import { criarPrograma, executarScriptTsx, RAIZ } from "./program.js";

carregarEnv(join(RAIZ, ".env"));

const programa = criarPrograma({
  criarContainer: () => criarContainer(process.env.DATA_DIR ?? join(RAIZ, "data")),
  escrever: (texto) => console.log(texto),
  executarScript: executarScriptTsx,
});

await programa.parseAsync(process.argv);
