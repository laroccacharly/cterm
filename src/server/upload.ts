import { mkdir, rm } from "node:fs/promises"
import path from "node:path"

import { Effect, Option } from "effect"
import { HttpServerResponse } from "effect/http"
import type { HttpServerRequest } from "effect/http"

import { uploadFilenameHeader } from "../api/upload.ts"
import type { UploadResponse } from "../api/upload.ts"
import { heifToPng, isHeif } from "../heif/heif.ts"
import { jsonError } from "./http.ts"

export const maxUploadBytes = 20 * 1024 * 1024

/** Extensions for types whose names often arrive without one, e.g. pasted screenshots. */
const extensions: ReadonlyMap<string, string> = new Map([
  ["application/json", "json"],
  ["application/pdf", "pdf"],
  ["image/avif", "avif"],
  ["image/bmp", "bmp"],
  ["image/gif", "gif"],
  ["image/heic", "heic"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/svg+xml", "svg"],
  ["image/webp", "webp"],
  ["text/csv", "csv"],
  ["text/plain", "txt"],
])

const slugOf = (value: string): string =>
  value
    .normalize("NFKD")
    .replaceAll(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")

const decodeName = (name: string): string => {
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

const stampOf = (date: Date): string =>
  date.toISOString().replaceAll(/[-:]/gu, "").replace("T", "-").slice(0, 15)

/**
 * A shell-safe file name for an upload: timestamp, slug of the original name
 * and a random suffix, so the pasted path never needs quoting.
 */
export const uploadFilename = (
  name: string,
  contentType: string,
  now: Date,
  id: string
): string => {
  const base = path.basename(decodeName(name))
  const dot = base.lastIndexOf(".")
  const stem = dot > 0 ? base.slice(0, dot) : base
  const nameExtension = dot > 0 ? slugOf(base.slice(dot + 1)).slice(0, 10) : ""
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? ""
  const extension =
    nameExtension.length > 0 ? nameExtension : (extensions.get(mime) ?? "bin")
  const slug = slugOf(stem).slice(0, 40) || "upload"
  return `${stampOf(now)}-${slug}-${id.slice(0, 6)}.${extension}`
}

const fail = (
  status: number,
  message: string
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.fromWeb(jsonError(status, "upload_failed", message))

/** Save one raw file body into `directory` and return its absolute path. */
export const uploadResponse = (
  request: HttpServerRequest.HttpServerRequest,
  directory: string
): Effect.Effect<HttpServerResponse.HttpServerResponse> =>
  Effect.gen(function* uploadResponseEffect() {
    const declaredLength = Number(request.headers["content-length"] ?? "0")
    if (declaredLength > maxUploadBytes) {
      return fail(413, "File is larger than 20 MB")
    }

    const body = yield* Effect.option(request.arrayBuffer)
    if (Option.isNone(body)) {
      return fail(400, "Could not read the file")
    }
    if (body.value.byteLength === 0) {
      return fail(400, "The file is empty")
    }
    if (body.value.byteLength > maxUploadBytes) {
      return fail(413, "File is larger than 20 MB")
    }

    const filename = uploadFilename(
      request.headers[uploadFilenameHeader] ?? "",
      request.headers["content-type"] ?? "",
      new Date(),
      crypto.randomUUID()
    )
    const originalPath = path.join(directory, filename)
    const data = body.value
    const prepare = Effect.tryPromise(async () => {
      await mkdir(directory, { recursive: true })
    })
    const saveOriginal = Effect.tryPromise(async () => {
      await Bun.write(originalPath, data)
      return originalPath
    })
    const pngPath = originalPath.replace(/\.hei[cf]$/iu, ".png")
    // Fail open: an unconverted HEIC is still better than a lost upload.
    const save = isHeif(filename)
      ? Effect.matchEffect(heifToPng(data, pngPath), {
          onFailure: (error) =>
            Effect.logWarning(
              `Keeping ${filename} as HEIC: ${error.message}`
            ).pipe(
              Effect.andThen(
                Effect.promise(async () => {
                  await rm(pngPath, { force: true })
                })
              ),
              Effect.andThen(saveOriginal)
            ),
          onSuccess: () => Effect.succeed(pngPath),
        })
      : saveOriginal
    return yield* Effect.match(Effect.andThen(prepare, save), {
      onFailure: () => fail(500, "Could not save the file"),
      onSuccess: (savedPath) =>
        HttpServerResponse.fromWeb(
          Response.json({ path: savedPath } satisfies UploadResponse, {
            status: 201,
          })
        ),
    })
  })
