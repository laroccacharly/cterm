import { describe, expect, test } from "bun:test"

import { urlFromDnsName } from "../../src/tailscale/tailscale.ts"

describe("urlFromDnsName", () => {
  test("strips the trailing dot and uses https", () => {
    expect(urlFromDnsName("host.tail0000.ts.net.")).toBe(
      "https://host.tail0000.ts.net"
    )
  })

  test("accepts a name without a trailing dot", () => {
    expect(urlFromDnsName("host.ts.net")).toBe("https://host.ts.net")
  })

  test("appends a non-default serve port", () => {
    expect(urlFromDnsName("host.tail0000.ts.net.", 8444)).toBe(
      "https://host.tail0000.ts.net:8444"
    )
  })

  test("omits the port when serving on the default 443", () => {
    expect(urlFromDnsName("host.ts.net", 443)).toBe("https://host.ts.net")
  })
})
