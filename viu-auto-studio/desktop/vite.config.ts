import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import electron from "vite-plugin-electron"
import path from "path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
/**
 * Electron mở dist/index.html bằng file:// — thẻ <script crossorigin> + file://
 * làm module script FAIL (net::ERR_FAILED, "Backend ngoại tuyến").
 * Plugin này bỏ thuộc tính crossorigin sau khi build.
 */
function stripCrossoriginPlugin() {
  return {
    name: "strip-crossorigin",
    enforce: "post" as const,
    generateBundle() {
      // no-op; xử lý ở transformIndexHtml
    },
    transformIndexHtml(html: string) {
      return html.replace(/\s*crossorigin/g, "")
    },
  }
}


function stripUnsupportedPlatformOption() {
  return {
    name: "strip-rollup-platform-option",
    configResolved(config: { build: { rollupOptions?: Record<string, unknown> } }) {
      if (config.build.rollupOptions) delete config.build.rollupOptions.platform
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    stripCrossoriginPlugin(),
    // Build electron main + preload vào dist-electron (cho `electron .` và electron-builder)
    electron([
      {
        entry: "electron/main.ts",
        format: "es",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron", "node:child_process", "node:fs", "node:net", "node:path", "node:os"],
              output: { format: "es", entryFileNames: "main.mjs" },
            },
            plugins: [stripUnsupportedPlatformOption()],
          },
        },
      },
      {
        entry: "electron/preload.ts",
        format: "cjs",
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: { external: ["electron"], output: { format: "cjs", entryFileNames: "[name].cjs" } },
            plugins: [stripUnsupportedPlatformOption()],
          },
        },
      },
    ]),
  ],
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 0,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom", "zustand"],
          radix: ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-popover", "@radix-ui/react-select", "@radix-ui/react-tabs"],
          icons: ["lucide-react"],
        },
      },
    },
  },
})
