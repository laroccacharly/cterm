import { describe, expect, test } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { Effect, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"

import { UploadResponseSchema } from "../../src/api/upload.ts"
import { uploadFilename, uploadResponse } from "../../src/server/upload.ts"

const decodeUpload = Schema.decodeUnknownSync(UploadResponseSchema)

const call = async (
  directory: string,
  body: BodyInit,
  headers: Record<string, string>
): Promise<Response> =>
  await Effect.runPromise(
    uploadResponse(
      HttpServerRequest.fromWeb(
        new Request("http://localhost/upload", {
          body,
          headers,
          method: "POST",
        })
      ),
      directory
    ).pipe(Effect.map(HttpServerResponse.toWeb))
  )

describe("upload endpoint", () => {
  test("saves the body and returns its absolute path", async () => {
    const directory = path.join(
      mkdtempSync(path.join(tmpdir(), "cterm-upload-")),
      "uploads"
    )
    const response = await call(directory, "hello", {
      "content-type": "text/plain",
      "x-filename": encodeURIComponent("My Notes.txt"),
    })

    expect(response.status).toBe(201)
    const { path: saved } = decodeUpload(await response.json())
    expect(path.dirname(saved)).toBe(directory)
    expect(path.basename(saved)).toMatch(
      /^\d{8}-\d{6}-my-notes-[\da-f]{6}\.txt$/u
    )
    expect(readFileSync(saved, "utf-8")).toBe("hello")
  })

  test("converts HEIC images to PNG before saving", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "cterm-upload-"))
    const heic = readFileSync(
      path.join(import.meta.dir, "../fixtures/tiny.heic")
    )
    const response = await call(directory, heic, {
      "content-type": "image/heic",
      "x-filename": "IMG_0001.HEIC",
    })

    expect(response.status).toBe(201)
    const { path: saved } = decodeUpload(await response.json())
    expect(path.basename(saved)).toMatch(/-img-0001-[\da-f]{6}\.png$/u)
    expect(readdirSync(directory)).toEqual([path.basename(saved)])
    expect([...readFileSync(saved).subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47])
  })

  test("keeps the original HEIC when conversion fails", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "cterm-upload-"))
    const response = await call(directory, "not really heic", {
      "content-type": "image/heic",
      "x-filename": "IMG_0002.HEIC",
    })

    expect(response.status).toBe(201)
    const { path: saved } = decodeUpload(await response.json())
    expect(path.basename(saved)).toMatch(/-img-0002-[\da-f]{6}\.heic$/u)
    expect(readdirSync(directory)).toEqual([path.basename(saved)])
    expect(readFileSync(saved, "utf-8")).toBe("not really heic")
  })

  test("rejects an empty body", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "cterm-upload-"))
    const response = await call(directory, "", { "content-type": "image/png" })
    expect(response.status).toBe(400)
  })
})

describe("upload file names", () => {
  const now = new Date("2026-10-11T14:23:01Z")

  test("are shell-safe whatever the original name", () => {
    expect(
      uploadFilename("../Écran $(rm -rf) 1.PNG", "image/png", now, "abcdef12")
    ).toBe("20261011-142301-ecran-rm-rf-1-abcdef.png")
  })

  test("take the extension from the type when the name has none", () => {
    expect(uploadFilename("", "image/png", now, "abcdef")).toBe(
      "20261011-142301-upload-abcdef.png"
    )
    expect(uploadFilename("blob", "", now, "abcdef")).toBe(
      "20261011-142301-blob-abcdef.bin"
    )
  })
})
