import { expect, test } from "bun:test"
import { SttClient } from "@laroccacharly/stt-client"
import { Effect } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { transcribeResponse } from "../../src/server/transcribe.ts"

test("passes browser audio to the STT client and returns its transcript", async () => {
  const server = Bun.serve({ port: 0, async fetch(request) {
    expect(new URL(request.url).pathname).toBe("/v1/transcribe")
    expect(request.headers.get("content-type")).toBe("audio/webm")
    expect([...new Uint8Array(await request.arrayBuffer())]).toEqual([1, 2, 3])
    return Response.json({ text: "hello" })
  } })
  try {
    const request = new Request("http://localhost/transcribe", { method: "POST", headers: { "content-type": "audio/webm" }, body: new Uint8Array([1, 2, 3]) })
    const response = await Effect.runPromise(Effect.gen(function* transcribeTest() {
      return yield* transcribeResponse(HttpServerRequest.fromWeb(request), yield* SttClient)
    }).pipe(Effect.provide(SttClient.layer(server.url.href)), Effect.map(HttpServerResponse.toWeb)))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ text: "hello" })
  } finally {
    await server.stop(true)
  }
})

test("reports an STT service error to the caller", async () => {
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ message: "Model unavailable" }, { status: 503 }) })
  try {
    const request = new Request("http://localhost/transcribe", { method: "POST", headers: { "content-type": "audio/webm" }, body: new Uint8Array([1]) })
    const response = await Effect.runPromise(Effect.gen(function* transcribeFailureTest() {
      return yield* transcribeResponse(HttpServerRequest.fromWeb(request), yield* SttClient)
    }).pipe(Effect.provide(SttClient.layer(server.url.href)), Effect.map(HttpServerResponse.toWeb)))
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ message: "Model unavailable" })
  } finally {
    await server.stop(true)
  }
})
