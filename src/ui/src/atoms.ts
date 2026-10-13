import { Duration } from "effect"
import { FetchHttpClient } from "effect/http"
import { Atom } from "effect/reactivity"

import type { TranscriptionModel } from "../../api/transcription.ts"
import {
  fetchCommands,
  fetchCurrentDiff,
  selectVoiceCommand,
  setTranscriptionModel,
  transcribeAudio,
  uploadFiles,
} from "./api.ts"

/** Effect runtime shared by every client atom. */
export const appRuntime = Atom.runtime(FetchHttpClient.layer)

/**
 * Command catalogue, revalidated whenever the Commands page opens since pi's
 * scoped models and the active speech-to-text model change at runtime.
 */
export const commandsAtom = Atom.keepAlive(
  appRuntime.atom(fetchCommands).pipe(Atom.swr({ staleTime: Duration.zero }))
)

/**
 * Working-tree diff for a terminal session, always revalidated when the Diff
 * view is opened so it follows the active tab's working directory.
 */
export const diffAtom = Atom.family((session: number) =>
  appRuntime
    .atom(fetchCurrentDiff(session))
    .pipe(Atom.swr({ staleTime: Duration.zero }))
)

/** Transcribe one recorded clip. */
export const transcribeAtom = appRuntime.fn((audio: Blob) =>
  transcribeAudio(audio)
)

/** Switch the server's speech-to-text model. */
export const transcriptionModelAtom = appRuntime.fn(
  (model: TranscriptionModel) => setTranscriptionModel(model)
)

/** Save files on the cterm host, resolving to their absolute paths. */
export const uploadAtom = appRuntime.fn((files: readonly File[]) =>
  uploadFiles(files)
)

/** Ask jev to pick a supported command for a spoken transcript. */
export const voiceCommandAtom = appRuntime.fn((transcript: string) =>
  selectVoiceCommand(transcript)
)
