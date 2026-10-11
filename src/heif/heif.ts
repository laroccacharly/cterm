import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { Effect } from "effect"

export const heifConvertMissingMessage =
  "heif-convert is not installed on the cterm host; install it (e.g. `sudo pacman -S libheif`) and run `bun cterm service reinstall`"

/** Whether a saved upload name is a HEIC/HEIF image, which agents can't read. */
export const isHeif = (filename: string): boolean =>
  /\.hei[cf]$/iu.test(filename)

/** Fail with a clear message when heif-convert is not available on PATH. */
export const ensureHeifConvert = (
  which: (command: string) => string | null = Bun.which
): Effect.Effect<void, Error> =>
  which("heif-convert") === null
    ? Effect.fail(new Error(heifConvertMissingMessage))
    : Effect.void

/**
 * Decode a HEIC/HEIF image (what iPhones send) into a PNG at `output`. The
 * HEIC bytes only touch a temporary file, never the uploads directory.
 */
export const heifToPng = (
  data: ArrayBuffer,
  output: string
): Effect.Effect<void, Error> =>
  Effect.andThen(
    ensureHeifConvert(),
    Effect.tryPromise({
      catch: (cause) =>
        cause instanceof Error ? cause : new Error(String(cause)),
      try: async () => {
        const input = path.join(tmpdir(), `cterm-${crypto.randomUUID()}.heic`)
        await Bun.write(input, data)
        try {
          const subprocess = Bun.spawn(["heif-convert", input, output], {
            stderr: "pipe",
            stdout: "ignore",
          })
          const [exitCode, stderr] = await Promise.all([
            subprocess.exited,
            new Response(subprocess.stderr).text(),
          ])
          if (exitCode !== 0 || !(await Bun.file(output).exists())) {
            throw new Error(
              `heif-convert could not convert the image to png: ${stderr.trim() || `exit code ${exitCode}`}`
            )
          }
        } finally {
          await rm(input, { force: true })
        }
      },
    })
  )
