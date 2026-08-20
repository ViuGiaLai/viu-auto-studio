import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import electron from "vite-plugin-electron"
import path from "path"
import fs from "node:fs"
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

/**
 * package.json "type":"module" khiến Vite nhét `import` vào preload.cjs.
 * Electron nạp .cjs như CommonJS → SyntaxError, mất electronAPI, UI hiện Offline.
 * Ghi file require() thuần và ghi đè lại nếu bundler xen vào.
 */
const PRELOAD_CJS = `const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke("ping"),
  openExternal: (url) => ipcRenderer.invoke("open:external", url),
  getRuntimeConfig: () => ipcRenderer.invoke("getRuntimeConfig"),
  getUserDataDir: () => ipcRenderer.invoke("getUserDataDir"),
  selectDirectory: () => ipcRenderer.invoke("dialog:select-directory"),
})
`

function preloadDest() {
  return path.resolve(__dirname, "dist-electron/preload.cjs")
}

function writePreloadCjs() {
  const dest = preloadDest()
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, PRELOAD_CJS, "utf8")
}

function preloadIsEsm(file: string) {
  try {
    const text = fs.readFileSync(file, "utf8")
    return /\bimport\s+/.test(text) || /\bexport\s+/.test(text)
  } catch {
    return true
  }
}

function preloadCjsPlugin(): Plugin {
  let writing = false
  const ensure = () => {
    if (writing) return
    writing = true
    try {
      writePreloadCjs()
    } finally {
      writing = false
    }
  }
  return {
    name: "write-cjs-preload",
    buildStart() {
      ensure()
    },
    configureServer() {
      ensure()
      const dest = preloadDest()
      fs.watch(path.dirname(dest), { persistent: false }, (_event, filename) => {
        if (filename !== "preload.cjs") return
        setTimeout(() => {
          if (preloadIsEsm(dest)) ensure()
        }, 30)
      })
    },
    closeBundle() {
      ensure()
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    stripCrossoriginPlugin(),
    preloadCjsPlugin(),
    electron([
      {
        entry: "electron/main.ts",
        format: "es",
        vite: {
          build: {
            outDir: "dist-electron",
            emptyOutDir: false,
            rollupOptions: {
              external: ["electron", "node:child_process", "node:fs", "node:net", "node:path", "node:os"],
              output: { format: "es", entryFileNames: "main.mjs" },
            },
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
