import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = process.env.VITE_PROXY_TARGET || env.VITE_PROXY_TARGET || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    test: {
      setupFiles: "./src/test-setup.ts"
    },
    build: {
      chunkSizeWarningLimit: 1000
    },
    server: {
      port: 5173,
      proxy: {
        "/api": apiProxyTarget,
        "/health": apiProxyTarget
      }
    }
  };
});
