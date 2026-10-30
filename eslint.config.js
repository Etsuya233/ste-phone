import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

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
    files: ["src/features/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/infrastructure/**", "**/frontend/**"],
              message: "功能核心只依赖自身类型与读取约定，外部实现由入口注入。",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/frontend/**/*.{ts,tsx}", "src/infrastructure/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/features/background/background.ts",
                "**/features/background/data-source.ts",
                "**/features/background/ports/**",
              ],
              message: "通过 features/background/index.ts 使用背景资料功能。",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
