import { useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/unstable/reactivity"

import type { Command } from "../../../commands/commands.ts"
import { commandsAtom } from "../atoms.ts"
import type { CommandContext } from "./commands.ts"
import { runCommand } from "./commands.ts"

interface CommandsViewProps {
  readonly context: CommandContext
}

const LoadingMessage = () => (
  <div className="diff-message" role="status">
    Loading commands…
  </div>
)

const ErrorMessage = ({ message }: { readonly message: string }) => (
  <div className="diff-message diff-message--error" role="alert">
    {message}
  </div>
)

const NoCommandsMessage = () => (
  <div className="diff-message">
    <strong>No commands</strong>
    <span>There is nothing to run right now.</span>
  </div>
)

interface CommandListProps {
  readonly commands: readonly Command[]
  readonly context: CommandContext
}

const CommandList = ({ commands, context }: CommandListProps) => {
  if (commands.length === 0) {
    return <NoCommandsMessage />
  }

  return (
    <ul className="command-list">
      {commands.map((command) => (
        <li key={command.id}>
          <button
            aria-label={command.label}
            className="command-item"
            onClick={() => {
              runCommand(command, context)
            }}
            type="button"
          >
            <span className="command-item__label">{command.label}</span>
            <span className="command-item__description">
              {command.description}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export const CommandsView = ({ context }: CommandsViewProps) => {
  const commandsResult = useAtomValue(commandsAtom)

  const content = AsyncResult.matchWithError(commandsResult, {
    onDefect: (defect) => <ErrorMessage message={String(defect)} />,
    onError: (error) => <ErrorMessage message={error.message} />,
    onInitial: () => <LoadingMessage />,
    onSuccess: (success) => (
      <CommandList commands={success.value.commands} context={context} />
    ),
  })

  return (
    <section aria-label="Commands" className="commands-frame">
      <div className="commands-content">{content}</div>
    </section>
  )
}
