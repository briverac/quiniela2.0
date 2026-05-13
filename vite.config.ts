import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  /** Use root wrangler.jsonc so build output matches prod worker name + D1 id (not dist folder name "quiniela2"). */
  plugins: [react(), cloudflare({ configPath: "./wrangler.jsonc" })],
});
