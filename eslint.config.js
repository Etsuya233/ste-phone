import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";
import { appBoundaries } from "./scripts/eslint-app-boundaries.js";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "tmp/**", ".worktrees/**", ".scratch/**"] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/consistent-type-imports": "error" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { phone: { rules: { "app-boundaries": appBoundaries } } },
    rules: {
      "phone/app-boundaries": "error",
    },
  },
  prettier,
  // 放在 Prettier 配置之后，确保控制流始终使用花括号并逐行展开。
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    rules: {
      curly: ["error", "all"],
      "max-statements-per-line": ["error", { max: 1 }],
    },
  },
);
