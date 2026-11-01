import { expect, test } from "bun:test"

import { SttClient } from "@laroccacharly/stt-client"
import { Effect } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"

import {
  prepareResponse,
  transcribeResponse,
} from "../../src/server/transcribe.ts"

const audioRequest = () =>
  HttpServerRequest.fromWeb(
    new Request("http://localhost/transcribe", {
      body: new Uint8Array([1, 2, 3]),
      headers: { "content-type": "audio/webm" },
      method: "POST",
    })
  )

const runWithClient = async (
  sttUrl: string,
  call: (
    transcription: SttClient["Service"]
  ) => Effect.Effect<HttpServerResponse.HttpServerResponse>
): Promise<Response> =>
  await Effect.runPromise(
    Effect.gen(function* runWithClientEffect() {
      const transcription = yield* SttClient
      return yield* call(transcription)
    }).pipe(
      Effect.provide(SttClient.layer(sttUrl)),
      Effect.map(HttpServerResponse.toWeb)
    )
  )

test("passes browser audio to the STT client and returns its transcript", async () => {
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      expect(new URL(request.url).pathname).toBe("/v1/transcribe")
      expect(request.headers.get("content-type")).toBe("audio/webm")
      expect([...new Uint8Array(await request.arrayBuffer())]).toEqual([
        1, 2, 3,
      ])
      return Response.json({ text: "hello" })
    },
  })
  try {
    const response = await runWithClient(server.url.href, (transcription) =>
      transcribeResponse(audioRequest(), transcription)
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ text: "hello" })
  } finally {
    await server.stop(true)
  }
})

test("reports an STT service error to the caller", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: () =>
      Response.json({ message: "Model unavailable" }, { status: 503 }),
  })
  try {
    const response = await runWithClient(server.url.href, (transcription) =>
      transcribeResponse(audioRequest(), transcription)
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({
      message: "Model unavailable",
    })
  } finally {
    await server.stop(true)
  }
})

test("prepares the local model and answers with no content", async () => {
  const requests: string[] = []
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      requests.push(`${request.method} ${new URL(request.url).pathname}`)
      return Response.json({})
    },
  })
  try {
    const response = await runWithClient(server.url.href, (transcription) =>
      prepareResponse(transcription)
    )
    expect(response.status).toBe(204)
    expect(requests).toEqual(["POST /v1/prepare"])
  } finally {
    await server.stop(true)
  }
})

test("explains that stt-server is not running when it cannot be reached", async () => {
  const response = await runWithClient("http://127.0.0.1:1", (transcription) =>
    transcribeResponse(audioRequest(), transcription)
  )
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({
    error: "transcription_failed",
    message:
      "stt-server is not reachable at http://127.0.0.1:1; start it with `stt service install`",
  })
})

test("times out when stt-server does not answer", async () => {
  const pending = Promise.withResolvers<Response>()
  const server = Bun.serve({
    port: 0,
    fetch: async () => await pending.promise,
  })
  try {
    const response = await runWithClient(server.url.href, (transcription) =>
      transcribeResponse(audioRequest(), transcription, 50)
    )
    expect(response.status).toBe(504)
    expect(await response.json()).toMatchObject({
      message: "stt-server did not answer in time",
    })
  } finally {
    pending.resolve(new Response("late"))
    await server.stop(true)
  }
})
