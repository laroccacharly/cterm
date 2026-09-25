import { Duration } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { Atom } from "effect/unstable/reactivity"

import {
  fetchCommands,
  fetchCurrentDiff,
  selectVoiceCommand,
  transcribeAudio,
} from "./api.ts"

/** Effect runtime shared by every client atom. */
export const appRuntime = Atom.runtime(FetchHttpClient.layer)

/** Cached command catalogue; it only changes with a new build. */
export const commandsAtom = Atom.keepAlive(
  appRuntime
    .atom(fetchCommands)
    .pipe(Atom.swr({ staleTime: Duration.infinity }))
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

/** Ask jev to pick a supported command for a spoken transcript. */
export const voiceCommandAtom = appRuntime.fn((transcript: string) =>
  selectVoiceCommand(transcript)
)
