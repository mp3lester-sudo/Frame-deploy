import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next.js resolves "server-only" as a special case even when it
      // isn't an installed package; Vitest has no such special case, so
      // it's aliased to a local no-op stub (see test-stubs/server-only.js)
      // for any test that transitively imports a server-only-guarded module.
      "server-only": path.resolve(__dirname, "./test-stubs/server-only.js"),
    },
  },
});
