import { defineConfig } from "vitest/config";

// Sem banco (DATABASE_URL), os testes de integração pulam; os adapters Postgres
// só entram na meta de cobertura quando rodam de verdade (CI).
const semBanco = !process.env.DATABASE_URL;

export default defineConfig({
  test: {
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: [
        "src/index.ts",
        "src/ports/**",
        ...(semBanco ? ["src/adapters/vector/pgvector.ts", "src/adapters/cache/postgres.ts"] : []),
      ],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
});
