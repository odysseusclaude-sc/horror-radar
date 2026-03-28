import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/games": "http://localhost:8000",
      "/channels": "http://localhost:8000",
      "/videos": "http://localhost:8000",
      "/runs": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
});
