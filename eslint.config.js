import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const bunTestGlobals = {
  bun: "readonly",
};

const electronImport = { name: "electron", message: "This layer must not import Electron." };
const reactImport = { name: "react", message: "This layer must not import React." };
const reactDomImport = { name: "react-dom", message: "This layer must not import React." };
const applicationImport = {
  name: "@pho-code/application",
  message: "This layer must not import application use cases.",
};
const runtimeImport = {
  name: "@pho-code/runtime",
  message: "This layer must not import the harness runtime.",
};
const nodePattern = { group: ["node:*"], message: "This layer must not import Node modules." };
const piSdkPattern = { group: ["@earendil-works/*"], message: "This layer must not import Pi SDK packages." };
const phoCodePattern = { group: ["@pho-code/*"], message: "Pho Agent must not depend on a product package." };
const piTuiImport = { name: "@earendil-works/pi-tui", message: "Do not import pi-tui. Plan/Agent uses JSON-safe host dialogs." };
const juicesharpImport = {
  name: "@juicesharp/rpiv-ask-user-question",
  message: "Do not bake juicesharp. Ask-user is a Pho-owned factory.",
};

export default tseslint.config(
  {
    ignores: [
      "refs/**",
      "node_modules/**",
      "**/dist/**",
      "**/out/**",
      "**/release/**",
      "**/.package-stage/**",
      "apps/desktop/resources/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js}"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["packages/pho-agent/packages/protocol/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [electronImport, reactImport, reactDomImport, piTuiImport, juicesharpImport],
          patterns: [nodePattern, piSdkPattern, phoCodePattern],
        },
      ],
    },
  },
  {
    files: ["packages/pho-agent/packages/runtime/**/*.{ts,tsx}", "packages/pho-agent/packages/evals/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [electronImport, reactImport, reactDomImport, applicationImport, runtimeImport, piTuiImport, juicesharpImport],
          patterns: [phoCodePattern],
        },
      ],
    },
  },
  {
    files: ["packages/protocol/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [electronImport, reactImport, reactDomImport, applicationImport, runtimeImport, piTuiImport, juicesharpImport],
          patterns: [nodePattern, piSdkPattern],
        },
      ],
    },
  },
  {
    files: ["packages/application/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [electronImport, reactImport, reactDomImport, piTuiImport, juicesharpImport],
          patterns: [nodePattern, piSdkPattern],
        },
      ],
    },
  },
  {
    files: ["packages/runtime/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            electronImport,
            reactImport,
            reactDomImport,
            applicationImport,
            { name: "@pho-code/ui", message: "Runtime must not import UI packages." },
            piTuiImport,
            juicesharpImport,
          ],
        },
      ],
    },
  },
  {
    files: ["packages/ui/**/*.{ts,tsx}", "apps/desktop/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [electronImport, applicationImport, runtimeImport, piTuiImport, juicesharpImport],
          patterns: [nodePattern, piSdkPattern],
        },
      ],
    },
  },
  {
    files: ["scripts/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["packages/**/*.test.ts", "packages/**/*.test.tsx", "apps/desktop/tests/unit/**/*.test.ts", "scripts/**/*.test.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...bunTestGlobals,
      },
    },
  },
);
