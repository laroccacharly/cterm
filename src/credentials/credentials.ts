import {
  Config,
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect"

/** Vault service name used for every cterm secret in the OS keychain. */
export const CREDENTIALS_SERVICE = "cterm"

/** ElevenLabs key used for voice transcription. */
export const ELEVENLABS_API_KEY_ENV = "ELEVENLABS_API_KEY"

/** OpenRouter key used for transcription and to reach jev. */
export const OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY"

/** Every secret `cterm login` stores, in display order. */
export const secretNames = [
  ELEVENLABS_API_KEY_ENV,
  OPENROUTER_API_KEY_ENV,
] as const

export type SecretName = (typeof secretNames)[number]

/** Raised when the OS keychain cannot be read from or written to. */
export class CredentialsError extends Schema.TaggedError<CredentialsError>()(
  "CredentialsError",
  {
    cause: Schema.Defect(),
    detail: Schema.String,
  }
) {
  get message(): string {
    return this.detail
  }
}

const keychainHint =
  "the OS keychain is unavailable; on Linux this requires a running secret service such as GNOME Keyring or KWallet"

/** Keychain failure detail, keeping the underlying error so it is diagnosable. */
const keychainDetail = (action: string, cause: unknown): string =>
  `${action}: ${keychainHint} (${cause instanceof Error ? cause.message : String(cause)})`

const fromEnv = (
  name: SecretName
): Effect.Effect<Option.Option<Redacted.Redacted>> =>
  Config.option(Config.redacted(name)).pipe(
    Effect.orElseSucceed(() => Option.none<Redacted.Redacted>())
  )

/**
 * Read the secret in a fresh `secret-tool` process. A long-running process
 * keeps its keychain connection, which goes stale when the secret service
 * restarts (for example after gnome-keyring-daemon crashes); a new process
 * opens a new connection.
 */
const loadFresh = async (name: SecretName): Promise<string | null> => {
  const child = Bun.spawn(
    ["secret-tool", "lookup", "service", CREDENTIALS_SERVICE, "account", name],
    { stderr: "pipe", stdout: "pipe" }
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (exitCode === 0) {
    return stdout
  }
  // secret-tool exits 1 with no output when the item does not exist.
  if (stderr.trim().length === 0) {
    return null
  }
  throw new Error(stderr.trim())
}

/** Read through Bun's keychain API, reconnecting via a fresh process on failure. */
const readSecret = async (name: SecretName): Promise<string | null> => {
  try {
    return await Bun.secrets.get({ name, service: CREDENTIALS_SERVICE })
  } catch {
    return await loadFresh(name)
  }
}

const load = (
  name: SecretName
): Effect.Effect<Option.Option<Redacted.Redacted>, CredentialsError> =>
  Effect.tryPromise({
    try: async () => await readSecret(name),
    catch: (cause) =>
      new CredentialsError({
        cause,
        detail: keychainDetail(
          `Could not read ${name} from the keychain`,
          cause
        ),
      }),
  }).pipe(
    Effect.map((value) =>
      value === null || value.trim().length === 0
        ? Option.none<Redacted.Redacted>()
        : Option.some(Redacted.make(value))
    )
  )

const save = (
  name: SecretName,
  key: Redacted.Redacted
): Effect.Effect<void, CredentialsError> =>
  Effect.tryPromise({
    try: async () => {
      await Bun.secrets.set({
        name,
        service: CREDENTIALS_SERVICE,
        value: Redacted.value(key),
      })
    },
    catch: (cause) =>
      new CredentialsError({
        cause,
        detail: keychainDetail(
          `Could not store ${name} in the keychain`,
          cause
        ),
      }),
  }).pipe(Effect.asVoid)

const remove = (name: SecretName): Effect.Effect<boolean, CredentialsError> =>
  Effect.tryPromise({
    try: async () =>
      await Bun.secrets.delete({ name, service: CREDENTIALS_SERVICE }),
    catch: (cause) =>
      new CredentialsError({
        cause,
        detail: keychainDetail(
          `Could not delete ${name} from the keychain`,
          cause
        ),
      }),
  })

const resolve = (
  name: SecretName
): Effect.Effect<Option.Option<Redacted.Redacted>, CredentialsError> =>
  Effect.gen(function* resolveSecret() {
    const env = yield* fromEnv(name)
    return Option.isSome(env) ? env : yield* load(name)
  })

export interface CredentialsService {
  /** Secret from the matching environment variable, if set. */
  readonly fromEnv: (
    name: SecretName
  ) => Effect.Effect<Option.Option<Redacted.Redacted>>
  /** Secret stored in the OS keychain, if present. */
  readonly load: (
    name: SecretName
  ) => Effect.Effect<Option.Option<Redacted.Redacted>, CredentialsError>
  /** Delete the stored secret; resolves to `true` when one was removed. */
  readonly remove: (
    name: SecretName
  ) => Effect.Effect<boolean, CredentialsError>
  /** Environment first, then the OS keychain. */
  readonly resolve: (
    name: SecretName
  ) => Effect.Effect<Option.Option<Redacted.Redacted>, CredentialsError>
  /** Store the secret in the OS keychain. */
  readonly save: (
    name: SecretName,
    value: Redacted.Redacted
  ) => Effect.Effect<void, CredentialsError>
}

/** Reads and writes cterm's secrets, preferring the environment. */
export class Credentials extends Context.Service<
  Credentials,
  CredentialsService
>()("cterm/credentials/Credentials") {
  static readonly layer = Layer.succeed(
    Credentials,
    Credentials.of({ fromEnv, load, remove, resolve, save })
  )
}
