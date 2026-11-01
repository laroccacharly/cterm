import { defineConfig } from "oxlint"
import tsLint from "ts-lint/config"
import antiSlop from "ultracite/oxlint/anti-slop"
import core from "ultracite/oxlint/core"

import effect from "./oxlint.effect.ts"

export default defineConfig({
  extends: [core, antiSlop, effect, tsLint],
  ignorePatterns: [...(core.ignorePatterns ?? []), "dist/**", "dist-ui/**"],
  options: {
    typeAware: true,
    typeCheck: true,
  },
  rules: {
    complexity: ["error", 15],
    "max-classes-per-file": "off",
    "max-depth": ["error", { max: 3 }],
    "sort-keys": "off",
    "unicorn/throw-new-error": "off",
    // Bun and keychain APIs are Promise-based throughout; stt makes the same call.
    "ts-lint/no-try-promise": "off",
  },
  overrides: [
    {
      // JSX attributes cannot early-return, and React omits a prop that is
      // `undefined`, so the UI keeps ternaries and `undefined` props.
      files: ["src/ui/**"],
      rules: { "ts-lint/no-ternary": "off", "ts-lint/no-undefined": "off" },
    },
  ],
})
