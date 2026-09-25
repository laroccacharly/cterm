import { Effect } from "effect"

export const ffmpegMissingMessage =
  "ffmpeg is not installed on the cterm host; install it (e.g. `sudo pacman -S ffmpeg`) and run `bun cterm service reinstall`"

/** Fail with a clear message when ffmpeg is not available on PATH. */
export const ensureFfmpeg = (
  which: (command: string) => string | null = Bun.which
): Effect.Effect<void, Error> =>
  which("ffmpeg") === null
    ? Effect.fail(new Error(ffmpegMissingMessage))
    : Effect.void

/**
 * Convert browser recordings into Ogg/Opus, since OpenRouter's transcription
 * provider rejects the WebM and MP4 containers. WebM/Opus is remuxed
 * losslessly; anything else (e.g. Safari's MP4/AAC) is re-encoded.
 */
export const remuxToOgg = (
  data: ArrayBuffer,
  extension: string
): Effect.Effect<ArrayBuffer, Error> =>
  Effect.andThen(ensureFfmpeg(), Effect.tryPromise({
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
    try: async () => {
      const subprocess = Bun.spawn(
        [
          "ffmpeg",
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          "pipe:0",
          "-vn",
          ...(extension === "webm"
            ? ["-c:a", "copy"]
            : ["-c:a", "libopus", "-b:a", "32k"]),
          "-f",
          "ogg",
          "pipe:1",
        ],
        { stderr: "pipe", stdin: new Uint8Array(data), stdout: "pipe" }
      )
      const [exitCode, stderr, stdout] = await Promise.all([
        subprocess.exited,
        new Response(subprocess.stderr).text(),
        new Response(subprocess.stdout).arrayBuffer(),
      ])
      if (exitCode !== 0 || stdout.byteLength === 0) {
        throw new Error(
          `ffmpeg could not convert the recording to ogg: ${stderr.trim() || `exit code ${exitCode}`}`
        )
      }
      return stdout
    },
  }))
