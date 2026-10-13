import type { TranscriptionModel } from "../../../api/transcription.ts"
import type { Command } from "../../../commands/commands.ts"

/** Everything a command may need from the terminal when it runs. */
export interface CommandContext {
  readonly changeFontSize: (delta: number) => void
  readonly sendInput: (data: string) => void
  readonly setTranscriptionModel: (model: TranscriptionModel) => void
}

/** Execute a command returned by the `/commands` endpoint. */
export const runCommand = (command: Command, context: CommandContext): void => {
  const { action } = command
  switch (action.type) {
    case "font-size": {
      context.changeFontSize(action.delta)
      return
    }
    case "input": {
      context.sendInput(action.data)
      return
    }
    case "transcription-model": {
      context.setTranscriptionModel(action.model)
      return
    }
    default: {
      const exhaustive: never = action
      return exhaustive
    }
  }
}
