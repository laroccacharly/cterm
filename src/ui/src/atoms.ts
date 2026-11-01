import { Duration } from "effect"
import { FetchHttpClient } from "effect/http"
import { Atom } from "effect/reactivity"

import {
  fetchCommands,
  fetchCurrentDiff,
  fetchScrollback,
  prepareTranscription,
  selectVoiceCommand,
  transcribeAudio,
  uploadFiles,
} from "./api.ts"

/** Effect runtime shared by every client atom. */
export const appRuntime = Atom.runtime(FetchHttpClient.layer)

/**
 * Command catalogue, revalidated whenever the Commands page opens since pi's
 * scoped models can change at runtime.
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

/** Snapshot a terminal session's history for client-side scrolling. */
export const scrollbackAtom = appRuntime.fn((session: number) =>
  fetchScrollback(session)
)

/** Load the local STT model so the first clip does not wait for it. */
export const prepareTranscriptionAtom = appRuntime.fn(
  () => prepareTranscription
)

/** Transcribe one recorded clip. */
export const transcribeAtom = appRuntime.fn((audio: Blob) =>
  transcribeAudio(audio)
)

/** Save files on the cterm host, resolving to their absolute paths. */
export const uploadAtom = appRuntime.fn((files: readonly File[]) =>
  uploadFiles(files)
)

/** Ask jev to pick a supported command for a spoken transcript. */
export const voiceCommandAtom = appRuntime.fn((transcript: string) =>
  selectVoiceCommand(transcript)
)
