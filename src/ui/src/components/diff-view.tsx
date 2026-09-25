import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { parsePatchFiles } from "@pierre/diffs"
import { FileDiff } from "@pierre/diffs/react"
import { AsyncResult } from "effect/unstable/reactivity"
import { useMemo } from "react"
import { createPortal } from "react-dom"

import type { DiffResponse } from "../../../api/diff.ts"
import type { ApiError } from "../../../api/error.ts"
import { diffAtom } from "../atoms.ts"

const diffOptions = {
  diffIndicators: "bars",
  diffStyle: "unified",
  lineDiffType: "word-alt",
  overflow: "scroll",
  theme: "pierre-dark",
  themeType: "dark",
} as const

interface DiffViewProps {
  readonly active: boolean
  readonly controlsContainer: HTMLDivElement | null
  readonly session: number
}

const LoadingMessage = () => (
  <div className="diff-message" role="status">
    Loading changes…
  </div>
)

const ErrorMessage = ({ message }: { readonly message: string }) => (
  <div className="diff-message diff-message--error" role="alert">
    {message}
  </div>
)

const NoChangesMessage = () => (
  <div className="diff-message">
    <strong>No changes</strong>
    <span>Your working tree is clean.</span>
  </div>
)

const DiffFiles = ({ patch }: { readonly patch: string }) => {
  const parsed = useMemo(() => {
    if (patch === "") {
      return { error: null, files: [] }
    }
    try {
      return {
        error: null,
        files: parsePatchFiles(patch, "cterm", true).flatMap(
          ({ files }) => files
        ),
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        files: [],
      }
    }
  }, [patch])

  if (parsed.error !== null) {
    return <ErrorMessage message={parsed.error} />
  }
  if (patch === "") {
    return <NoChangesMessage />
  }

  return (
    <div className="diff-files">
      {parsed.files.map((file, index) => (
        <FileDiff
          className="diff-file"
          disableWorkerPool
          fileDiff={file}
          key={`${file.name}-${index}`}
          options={diffOptions}
        />
      ))}
    </div>
  )
}

interface DiffBodyProps {
  readonly result: AsyncResult.AsyncResult<DiffResponse, ApiError>
}

const DiffBody = ({ result }: DiffBodyProps) => {
  const data = AsyncResult.getOrElse(result, () => null)
  if (data !== null) {
    return <DiffFiles patch={data.patch} />
  }

  return AsyncResult.matchWithError(result, {
    onDefect: (defect) => <ErrorMessage message={String(defect)} />,
    onError: (error) => <ErrorMessage message={error.message} />,
    onInitial: () => <LoadingMessage />,
    onSuccess: () => <NoChangesMessage />,
  })
}

export const DiffView = ({
  active,
  controlsContainer,
  session,
}: DiffViewProps) => {
  const sessionDiffAtom = diffAtom(session)
  const diffResult = useAtomValue(sessionDiffAtom)
  const refresh = useAtomRefresh(sessionDiffAtom)
  const data = AsyncResult.getOrElse(diffResult, () => null)
  const repository = data?.repository ?? ""
  const repositoryName = repository.split("/").at(-1) ?? repository
  const isFetching = AsyncResult.isWaiting(diffResult)

  return (
    <>
      {controlsContainer === null
        ? null
        : createPortal(
            <>
              <div className="diff-heading">
                <span className="diff-eyebrow">Working tree</span>
                <strong title={repository}>
                  {repositoryName || "Git diff"}
                </strong>
              </div>
              <button
                aria-label="Refresh diff"
                className="refresh-button"
                disabled={isFetching}
                onClick={refresh}
                type="button"
              >
                {isFetching ? "Loading…" : "Refresh"}
              </button>
            </>,
            controlsContainer
          )}
      <section
        aria-label="Git diff"
        className={`diff-frame ${active ? "diff-frame--active" : "diff-frame--hidden"}`}
      >
        <div className="diff-content">
          <DiffBody result={diffResult} />
        </div>
      </section>
    </>
  )
}
