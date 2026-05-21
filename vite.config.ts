import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwind(), tanstackStart(), react(), tsconfigPaths()],
});
