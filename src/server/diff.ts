import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import type { DiffResponse } from "../api/diff.ts"

const maxDiffBytes = 8 * 1024 * 1024

interface CommandOptions {
  readonly cwd?: string
  readonly env?: Record<string, string>
}

interface CommandResult {
  readonly exitCode: number
  readonly stderr: string
  readonly stdout: string
}

const runCommand = async (
  command: readonly string[],
  options: CommandOptions = {}
): Promise<CommandResult> => {
  const subprocess = Bun.spawn([...command], {
    cwd: options.cwd,
    env: options.env,
    stderr: "pipe",
    stdout: "pipe",
  })
  const [exitCode, stderr, stdout] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stderr).text(),
    new Response(subprocess.stdout).text(),
  ])

  return { exitCode, stderr, stdout }
}

/** Resolve the working directory of the tmux pane backing the web terminal. */
export const terminalWorkingDirectory = async (
  sessionName: string,
  fallback: string
): Promise<string> => {
  const result = await runCommand([
    "tmux",
    "display-message",
    "-p",
    "-t",
    sessionName,
    "#{pane_current_path}",
  ])

  return result.exitCode === 0 && result.stdout.trim() !== ""
    ? result.stdout.trim()
    : fallback
}

/**
 * Build an index containing the real staging state plus the repository's
 * untracked files marked as intent-to-add, so `git diff` renders new files
 * without mutating the user's actual index.
 */
const prepareDiffIndex = async (
  repositoryPath: string,
  hasHead: boolean
): Promise<{ readonly directory: string; readonly indexFile: string }> => {
  const directory = await mkdtemp(path.join(tmpdir(), "cterm-diff-"))
  const indexFile = path.join(directory, "index")

  if (hasHead) {
    const realIndex = await runCommand([
      "git",
      "-C",
      repositoryPath,
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "index",
    ])
    if (realIndex.exitCode === 0 && realIndex.stdout.trim() !== "") {
      try {
        await copyFile(realIndex.stdout.trim(), indexFile)
      } catch {
        // A missing or unreadable index just means no staging state to keep.
      }
    }
  }

  await runCommand(
    ["git", "-C", repositoryPath, "add", "--intent-to-add", "--all"],
    { env: { ...process.env, GIT_INDEX_FILE: indexFile } }
  )

  return { directory, indexFile }
}

/** Return a renderable patch for all tracked and untracked changes. */
export const gitDiffResponse = async (directory: string): Promise<Response> => {
  const repository = await runCommand([
    "git",
    "-C",
    directory,
    "rev-parse",
    "--show-toplevel",
  ])
  if (repository.exitCode !== 0) {
    return Response.json(
      { message: "The terminal is not currently inside a Git repository." },
      { status: 422 }
    )
  }

  const repositoryPath = repository.stdout.trim()
  const hasHead = await runCommand([
    "git",
    "-C",
    repositoryPath,
    "rev-parse",
    "--verify",
    "HEAD",
  ])
  const hasCommit = hasHead.exitCode === 0
  const { directory: indexDirectory, indexFile } = await prepareDiffIndex(
    repositoryPath,
    hasCommit
  )

  try {
    const diffArguments = [
      "git",
      "-C",
      repositoryPath,
      "diff",
      "--no-ext-diff",
      "--no-color",
      "--no-prefix",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      "--find-renames",
    ]
    if (hasCommit) {
      diffArguments.push("HEAD")
    }
    diffArguments.push("--")

    const diff = await runCommand(diffArguments, {
      env: { ...process.env, GIT_INDEX_FILE: indexFile },
    })
    if (diff.exitCode !== 0) {
      return Response.json(
        { message: diff.stderr.trim() || "Git could not produce a diff." },
        { status: 500 }
      )
    }
    if (new TextEncoder().encode(diff.stdout).byteLength > maxDiffBytes) {
      return Response.json(
        { message: "This diff is larger than the 8 MB rendering limit." },
        { status: 413 }
      )
    }

    const payload: DiffResponse = {
      patch: diff.stdout,
      repository: repositoryPath,
    }
    return Response.json(payload)
  } finally {
    await rm(indexDirectory, { force: true, recursive: true })
  }
}
