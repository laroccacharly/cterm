import { useAtomSet } from "@effect/atom-react"
import { useCallback, useEffect, useState } from "react"

import { uploadAtom } from "../atoms.ts"

interface UploadsOptions {
  /** Listen for files dropped or pasted anywhere on the page. */
  readonly enabled: boolean
  readonly onError: (message: string) => void
  readonly onPaths: (paths: readonly string[]) => void
}

export interface Uploads {
  readonly dragging: boolean
  readonly upload: (files: readonly File[]) => Promise<void>
  readonly uploading: boolean
}

const hasFiles = (event: DragEvent): boolean =>
  event.dataTransfer?.types.includes("Files") ?? false

/** Upload files dropped or pasted anywhere on the page; returns the cleanup. */
const listenForFiles = (
  enabled: boolean,
  upload: (files: readonly File[]) => Promise<void>,
  setDragging: (dragging: boolean) => void
): (() => void) => {
  const onDragOver = (event: DragEvent) => {
    if (!enabled || !hasFiles(event)) {
      return
    }
    event.preventDefault()
    setDragging(true)
  }
  const onDragLeave = (event: DragEvent) => {
    if (event.relatedTarget === null) {
      setDragging(false)
    }
  }
  const onDrop = (event: DragEvent) => {
    if (!enabled || !hasFiles(event)) {
      return
    }
    event.preventDefault()
    setDragging(false)
    void upload([...(event.dataTransfer?.files ?? [])])
  }
  // Capture so a pasted image never reaches xterm, which only handles text.
  const onPaste = (event: ClipboardEvent) => {
    const files = [...(event.clipboardData?.files ?? [])]
    if (!enabled || files.length === 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    void upload(files)
  }

  window.addEventListener("dragenter", onDragOver)
  window.addEventListener("dragover", onDragOver)
  window.addEventListener("dragleave", onDragLeave)
  window.addEventListener("drop", onDrop)
  window.addEventListener("paste", onPaste, { capture: true })
  return () => {
    window.removeEventListener("dragenter", onDragOver)
    window.removeEventListener("dragover", onDragOver)
    window.removeEventListener("dragleave", onDragLeave)
    window.removeEventListener("drop", onDrop)
    window.removeEventListener("paste", onPaste, { capture: true })
  }
}

/**
 * Save dropped, pasted or picked files on the cterm host and hand their paths
 * back, so the terminal can paste them for an agent to read.
 */
export const useUploads = ({
  enabled,
  onError,
  onPaths,
}: UploadsOptions): Uploads => {
  const uploadFiles = useAtomSet(uploadAtom, { mode: "promise" })
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)

  const upload = useCallback(
    async (files: readonly File[]) => {
      if (files.length === 0) {
        return
      }
      setUploading(true)
      try {
        onPaths(await uploadFiles(files))
      } catch (error) {
        onError(
          error instanceof Error && error.message.length > 0
            ? error.message
            : "Couldn't upload the file"
        )
      } finally {
        setUploading(false)
      }
    },
    [onError, onPaths, uploadFiles]
  )

  useEffect(
    () => listenForFiles(enabled, upload, setDragging),
    [enabled, upload]
  )

  return { dragging: enabled && dragging, upload, uploading }
}
