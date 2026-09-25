import { describe, expect, test } from "bun:test"

import { Option } from "effect"

import { isSameOrigin } from "../../src/server/router.ts"
import { parseClientMessage } from "../../src/terminal/protocol.ts"

describe("terminal protocol", () => {
  test("accepts input and bounded resize messages", () => {
    expect(
      Option.getOrThrow(
        parseClientMessage('{"type":"input","data":"echo hello\\r"}')
      )
    ).toEqual({ data: "echo hello\r", type: "input" })
    expect(
      Option.getOrThrow(
        parseClientMessage('{"type":"resize","cols":120,"rows":40}')
      )
    ).toEqual({ cols: 120, rows: 40, type: "resize" })
  })

  test("rejects malformed and excessive messages", () => {
    expect(Option.isNone(parseClientMessage("not json"))).toBe(true)
    expect(
      Option.isNone(
        parseClientMessage('{"type":"resize","cols":99999,"rows":40}')
      )
    ).toBe(true)
  })
})

describe("WebSocket origin policy", () => {
  test("allows same-origin browser requests", () => {
    const request = new Request("https://host.ts.net/ws", {
      headers: { Host: "host.ts.net", Origin: "https://host.ts.net" },
    })
    expect(isSameOrigin(request)).toBe(true)
  })

  test("allows the forwarded host from Tailscale", () => {
    const request = new Request("http://127.0.0.1:3001/ws", {
      headers: {
        Host: "127.0.0.1:3001",
        Origin: "https://host.ts.net:8444",
        "X-Forwarded-Host": "host.ts.net:8444",
      },
    })
    expect(isSameOrigin(request)).toBe(true)
  })

  test("rejects missing and cross-site origins", () => {
    expect(isSameOrigin(new Request("http://localhost/ws"))).toBe(false)
    const crossSite = new Request("https://host.ts.net/ws", {
      headers: { Host: "host.ts.net", Origin: "https://attacker.example" },
    })
    expect(isSameOrigin(crossSite)).toBe(false)
  })
})
