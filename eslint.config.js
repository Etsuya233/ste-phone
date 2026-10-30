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
                "**/features/database/database.ts",
                "**/features/database/database-service.ts",
              ],
              message: "通过对应功能的 index.ts 使用背景资料或数据库功能。",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
