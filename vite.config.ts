import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
    base: "/",
    plugins: [react()],
    resolve: {
        alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
        port: 3000,
        // Note: /api/gst is a Vercel serverless function — run `vercel dev` to exercise it locally.
    },
    build: {
        outDir: "dist",
        sourcemap: false,
    },
});
