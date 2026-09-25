import { useCallback, useEffect, useRef, useState } from "react"

export type RecorderState = "idle" | "recording" | "transcribing"

interface UseRecorderOptions {
  readonly onError: (message: string) => void
  readonly onTranscript: (text: string) => Promise<void> | void
  readonly transcribe: (audio: Blob) => Promise<string>
}

export interface Recorder {
  readonly state: RecorderState
  readonly toggle: () => void
}

/** Record microphone audio and transcribe it through the cterm server. */
export const useRecorder = ({
  onError,
  onTranscript,
  transcribe,
}: UseRecorderOptions): Recorder => {
  const [state, setState] = useState<RecorderState>("idle")
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const stopTracks = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop()
    }
    streamRef.current = null
  }, [])

  const finish = useCallback(
    async (blob: Blob) => {
      if (blob.size === 0) {
        onError("Nothing was recorded")
        setState("idle")
        return
      }

      setState("transcribing")
      try {
        const text = await transcribe(blob)
        if (text.trim().length > 0) {
          await onTranscript(text.trim())
        }
      } catch (error) {
        onError(
          error instanceof Error && error.message.length > 0
            ? error.message
            : "Transcription failed"
        )
      } finally {
        setState("idle")
      }
    },
    [onError, onTranscript, transcribe]
  )

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        stopTracks()
        void finish(blob)
      }

      recorder.start()
      recorderRef.current = recorder
      setState("recording")
    } catch (error) {
      stopTracks()
      onError(
        error instanceof Error && error.message.length > 0
          ? error.message
          : "Microphone is unavailable"
      )
      setState("idle")
    }
  }, [finish, onError, stopTracks])

  const stop = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
  }, [])

  const toggle = useCallback(() => {
    if (state === "recording") {
      stop()
    } else if (state === "idle") {
      void start()
    }
  }, [start, state, stop])

  useEffect(
    () => () => {
      const recorder = recorderRef.current
      if (recorder !== null) {
        recorder.onstop = null
        recorder.stop()
        recorderRef.current = null
      }
      stopTracks()
    },
    [stopTracks]
  )

  return { state, toggle }
}
