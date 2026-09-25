import { afterEach, describe, expect, test } from "bun:test"

import { Effect, Redacted } from "effect"

import type { SystemOneResponse } from "../../src/typesafe/client.ts"
import { openRouterModel, systemOne } from "../../src/typesafe/client.ts"

const request = { state: "state", model: "model", questions: {} }
const options = { apiKey: Redacted.make("test-key"), retries: 0 }

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

const validResponse = {
  answers: {},
  model: "test",
} satisfies SystemOneResponse

const jsonResponse = (body: SystemOneResponse, status = 200): Response =>
  Response.json(body, { status })

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

const mockFetch = (
  handler: () => Response | Promise<Response>
): (() => number) => {
  let calls = 0
  globalThis.fetch = Object.assign(
    async (_input: FetchInput, _init?: FetchInit) => {
      calls += 1
      return await handler()
    },
    { preconnect() {} }
  )
  return () => calls
}

interface CapturedRequest {
  readonly authorization: string | null
}

describe("openRouterModel", () => {
  test("namespaces bare TypeSafe aliases", () => {
    expect(openRouterModel("jev-latest")).toBe("~typesafe/jev-latest")
    expect(openRouterModel("anthropic/claude")).toBe("anthropic/claude")
  })
})

describe("systemOne", () => {
  test("sends the resolved OpenRouter bearer key", async () => {
    const captured: CapturedRequest[] = []
    globalThis.fetch = Object.assign(
      async (_input: FetchInput, init?: FetchInit) => {
        captured.push({
          authorization: new Headers(init?.headers).get("authorization"),
        })
        return await Promise.resolve(jsonResponse(validResponse))
      },
      { preconnect() {} }
    )

    await Effect.runPromise(
      systemOne({ ...request, model: "jev-latest" }, options)
    )

    expect(captured).toHaveLength(1)
    expect(captured[0]?.authorization).toBe("Bearer test-key")
  })

  test("retries transient network failures", async () => {
    let attempts = 0
    const calls = mockFetch(() => {
      attempts += 1
      if (attempts < 2) {
        throw new TypeError("network down")
      }
      return jsonResponse(validResponse)
    })

    const response = await Effect.runPromise(
      systemOne(request, { ...options, retries: 1 })
    )

    expect(response.model).toBe("test")
    expect(calls()).toBe(2)
  })

  test("does not retry client errors", async () => {
    const calls = mockFetch(() => new Response("bad request", { status: 400 }))

    const error = await Effect.runPromise(
      Effect.flip(systemOne(request, { ...options, retries: 3 }))
    )

    expect(calls()).toBe(1)
    expect(error.detail).toContain("400")
  })

  test("does not retry undeserializable responses", async () => {
    const calls = mockFetch(() => new Response("not json", { status: 200 }))

    const error = await Effect.runPromise(
      Effect.flip(systemOne(request, { ...options, retries: 3 }))
    )

    expect(calls()).toBe(1)
    expect(error.detail).toBe("Unexpected TypeSafe response")
  })
})
