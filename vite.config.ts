import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Saat `npm run dev`, teruskan /api ke `vercel dev` (port 3000).
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
