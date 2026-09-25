import { describe, expect, test } from "bun:test"

import { Schema } from "effect"

import {
  CtermConfigSchema,
  defaultConfig,
  defaultTailscalePort,
} from "../../src/config/config.ts"

const decodeConfig = Schema.decodeUnknownSync(
  Schema.fromJsonString(CtermConfigSchema)
)

describe("CtermConfigSchema", () => {
  test("defaults fields for older config files", () => {
    expect(decodeConfig('{"port":3111}')).toEqual({
      port: 3111,
      sessionName: defaultConfig.sessionName,
      tailscalePort: defaultTailscalePort,
      workingDirectory: defaultConfig.workingDirectory,
    })
  })

  test("keeps explicit fields", () => {
    expect(
      decodeConfig(
        '{"port":3111,"sessionName":"work","tailscalePort":9000,"workingDirectory":"/tmp"}'
      )
    ).toEqual({
      port: 3111,
      sessionName: "work",
      tailscalePort: 9000,
      workingDirectory: "/tmp",
    })
  })

  test("rejects unsafe tmux session names and invalid ports", () => {
    expect(() =>
      decodeConfig(
        '{"port":0,"sessionName":"bad name","tailscalePort":9000,"workingDirectory":"/tmp"}'
      )
    ).toThrow()
  })
})
