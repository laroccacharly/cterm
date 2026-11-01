import path from "node:path"

import { Effect, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import { runProcess } from "../process/command.ts"

const repoRoot = path.resolve(import.meta.dir, "../..")

/**
 * Directory that the Vite build writes the production UI into. The e2e server
 * overrides it so test builds never replace the UI a running cterm serves.
 */
export const uiDirectory =
  process.env.CTERM_UI_DIR ?? path.join(repoRoot, "dist-ui")

/** Raised when the React UI fails to build. */
export class UiBuildError extends Schema.TaggedError<UiBuildError>()(
  "UiBuildError",
  {
    cause: Schema.Defect(),
  }
) {}

/** Build the React UI with Vite. */
export const buildUi: () => Effect.Effect<
  void,
  UiBuildError,
  ChildProcessSpawner.ChildProcessSpawner
> = Effect.fn("buildUi")(function* buildUi() {
  yield* Effect.logInfo("Building the React UI...")

  const { exitCode } = yield* runProcess(
    ChildProcess.make(
      "bunx",
      ["--bun", "vite", "build", "--outDir", uiDirectory],
      {
        cwd: repoRoot,
      }
    ),
    (cause) => new UiBuildError({ cause })
  )

  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* new UiBuildError({
      cause: new Error(`vite build exited with code ${exitCode}`),
    })
  }

  return yield* Effect.logInfo("UI build complete")
})
