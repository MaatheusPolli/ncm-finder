import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // A API roda em :3333; o proxy evita CORS em desenvolvimento.
    proxy: { "/api": { target: "http://127.0.0.1:3333", rewrite: (p) => p.replace(/^\/api/, "") } },
  },
  test: { environment: "jsdom" },
});
