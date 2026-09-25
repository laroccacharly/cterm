import { Effect, Stream } from "effect"
import { ChildProcessSpawner } from "effect/unstable/process"
import type { ChildProcess } from "effect/unstable/process"

export interface ProcessResult {
  readonly exitCode: ChildProcessSpawner.ExitCode
  readonly output: string
}

/**
 * Run a child process and collect its combined output and exit code. The
 * command's resources are released when the effect completes.
 */
export const runProcess = <E>(
  command: ChildProcess.Command,
  mapError: (cause: unknown) => E
): Effect.Effect<ProcessResult, E, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* runProcessEffect() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const handle = yield* spawner.spawn(command).pipe(Effect.mapError(mapError))

    const output = yield* handle.all.pipe(
      Stream.decodeText(),
      Stream.mkString,
      Effect.mapError(mapError)
    )
    const exitCode = yield* handle.exitCode.pipe(Effect.mapError(mapError))

    return { exitCode, output }
  }).pipe(Effect.scoped)
