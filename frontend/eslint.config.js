import js from "@eslint/js";
import hooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src/components/ui/**",
      "src/hooks/use-mobile.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "jsx-a11y": jsxA11y,
      "react-hooks": hooks,
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      ...hooks.configs.flat.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: [
      "src/App.tsx",
      "src/auth/**/*.tsx",
      "src/components/**/*.tsx",
      "src/features/**/*.tsx",
      "src/pages/**/*.tsx",
    ],
    ignores: ["src/components/ui/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='button']",
          message: "Use the shadcn Button component instead of a raw button.",
        },
        {
          selector: "JSXOpeningElement[name.name='input']",
          message: "Use the shadcn Input component instead of a raw input.",
        },
        {
          selector: "JSXOpeningElement[name.name='select']",
          message: "Use the shadcn Select component instead of a raw select.",
        },
        {
          selector: "JSXOpeningElement[name.name='textarea']",
          message:
            "Use the shadcn Textarea component instead of a raw textarea.",
        },
        {
          selector: "JSXOpeningElement[name.name='table']",
          message: "Use the shadcn Table component instead of a raw table.",
        },
      ],
    },
  },
);
