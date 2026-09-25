import { defineConfig } from "oxlint"
import antiSlop from "ultracite/oxlint/anti-slop"
import core from "ultracite/oxlint/core"

import effect from "./oxlint.effect.ts"

export default defineConfig({
  extends: [core, antiSlop, effect],
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
  },
})
