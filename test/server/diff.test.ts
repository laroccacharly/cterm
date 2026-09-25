import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { parsePatchFiles } from "@pierre/diffs"
import { Schema } from "effect"

import { gitDiffResponse } from "../../src/server/diff.ts"

const DiffPayload = Schema.Struct({
  patch: Schema.String,
  repository: Schema.String,
})
const decodeDiffPayload = Schema.decodeUnknownSync(DiffPayload)

describe("Git diff endpoint", () => {
  test("returns staged and unstaged tracked changes", async () => {
    const repository = mkdtempSync(path.join(tmpdir(), "cterm-diff-"))
    const git = (...arguments_: string[]) => {
      execFileSync("git", arguments_, { cwd: repository })
    }
    git("init", "--quiet")
    git("config", "user.email", "cterm@example.test")
    git("config", "user.name", "cterm test")
    git("config", "diff.mnemonicPrefix", "true")
    writeFileSync(path.join(repository, "staged.txt"), "before\n")
    writeFileSync(path.join(repository, "working.txt"), "before\n")
    git("add", ".")
    git("commit", "--quiet", "-m", "initial")

    writeFileSync(path.join(repository, "staged.txt"), "after staged\n")
    git("add", "staged.txt")
    writeFileSync(path.join(repository, "working.txt"), "after working\n")
    writeFileSync(path.join(repository, "untracked.txt"), "brand new\n")

    const response = await gitDiffResponse(repository)
    const payload = decodeDiffPayload(await response.json())

    expect(response.status).toBe(200)
    expect(payload.repository).toBe(repository)
    expect(payload.patch).toContain("after staged")
    expect(payload.patch).toContain("after working")
    expect(payload.patch).toContain("diff --git a/staged.txt b/staged.txt")
    expect(payload.patch).toContain(
      "diff --git a/untracked.txt b/untracked.txt"
    )
    expect(payload.patch).toContain("new file mode")
    expect(parsePatchFiles(payload.patch, "test", true)[0]?.files).toHaveLength(
      3
    )
  })

  test("includes untracked files before the first commit", async () => {
    const repository = mkdtempSync(path.join(tmpdir(), "cterm-fresh-"))
    execFileSync("git", ["init", "--quiet"], { cwd: repository })
    writeFileSync(path.join(repository, "first.txt"), "first file\n")

    const response = await gitDiffResponse(repository)
    const payload = decodeDiffPayload(await response.json())

    expect(response.status).toBe(200)
    expect(payload.patch).toContain("diff --git a/first.txt b/first.txt")
    expect(payload.patch).toContain("new file mode")
    expect(parsePatchFiles(payload.patch, "test", true)[0]?.files).toHaveLength(
      1
    )
  })

  test("returns a useful error outside a repository", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "cterm-no-git-"))
    const response = await gitDiffResponse(directory)

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      message: "The terminal is not currently inside a Git repository.",
    })
  })
})
