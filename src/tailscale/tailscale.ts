import { Effect, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import { runProcess } from "../process/command.ts"

/** Raised when the Tailscale CLI cannot be run or returns an error. */
export class TailscaleError extends Schema.TaggedError<TailscaleError>()(
  "TailscaleError",
  {
    cause: Schema.Defect(),
    detail: Schema.String,
  }
) {}

/** The slice of `tailscale status --json` that cterm needs. */
const StatusJson = Schema.Struct({
  Self: Schema.Struct({
    DNSName: Schema.String,
  }),
})

const decodeStatus = Schema.decodeUnknownEffect(
  Schema.fromJsonString(StatusJson)
)

/** Derive the public HTTPS URL from a tailnet DNS name and serve port. */
export const urlFromDnsName = (dnsName: string, servePort = 443): string => {
  const host = dnsName.replace(/\.$/u, "")
  const port = servePort === 443 ? "" : `:${servePort}`
  return `https://${host}${port}`
}

const runTailscale = (args: readonly string[]) => {
  const detail = `tailscale ${args.join(" ")}`
  return runProcess(
    ChildProcess.make("tailscale", args),
    (cause) => new TailscaleError({ cause, detail })
  )
}

const run = Effect.fn("tailscale")(function* run(args: readonly string[]) {
  const { exitCode, output } = yield* runTailscale(args)

  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* new TailscaleError({
      cause: new Error(output),
      detail: `tailscale ${args.join(" ")} failed`,
    })
  }

  return output
})

/**
 * Point Tailscale Serve at the locally running cterm server.
 *
 * Serve configs are keyed by HTTPS port, not path, so cterm is published on its
 * own port. This is what keeps cterm and other tailnet services (for example the
 * default 443 mapping another app may own) from clobbering each other.
 */
export const serve = Effect.fn("Tailscale.serve")(function* serve(
  port: number,
  servePort: number
) {
  yield* run([
    "serve",
    "--bg",
    `--https=${servePort}`,
    `http://127.0.0.1:${port}`,
  ])
})

/**
 * Stop serving cterm over Tailscale, leaving every other HTTPS port alone.
 *
 * `serve ... off` exits non-zero when nothing is mapped on the port, so the
 * result is deliberately ignored to keep uninstall idempotent.
 */
export const reset = Effect.fn("Tailscale.reset")(function* reset(
  servePort: number
) {
  yield* runTailscale(["serve", `--https=${servePort}`, "off"])
})

/** Collect the current Tailscale status output. */
export const status = Effect.fn("Tailscale.status")(function* status() {
  const { output } = yield* runTailscale(["status"])
  return output
})

/** Collect the current Tailscale Serve configuration. */
export const serveStatus = Effect.fn("Tailscale.serveStatus")(
  function* serveStatus() {
    const { output } = yield* runTailscale(["serve", "status"])
    return output
  }
)

/** Resolve the public URL cterm is served at on the tailnet. */
export const publicUrl = Effect.fn("Tailscale.publicUrl")(function* publicUrl(
  servePort: number
) {
  const output = yield* run(["status", "--json"])

  const parsed = yield* decodeStatus(output).pipe(
    Effect.mapError(
      (cause) =>
        new TailscaleError({
          cause,
          detail: "parse tailscale status --json",
        })
    )
  )

  return urlFromDnsName(parsed.Self.DNSName, servePort)
})
