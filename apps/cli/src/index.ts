#!/usr/bin/env -S npx tsx
import { join } from "node:path";
import { criarContainer } from "@ncm-finder/core";
import { criarPrograma, executarScriptTsx, RAIZ } from "./program.js";

const programa = criarPrograma({
  criarContainer: () => criarContainer(process.env.DATA_DIR ?? join(RAIZ, "data")),
  escrever: (texto) => console.log(texto),
  executarScript: executarScriptTsx,
});

await programa.parseAsync(process.argv);
