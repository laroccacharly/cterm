import type { ConnectionStatus as Status } from "../hooks/use-terminal.ts"

interface ConnectionStatusProps {
  readonly status: Status
}

export const ConnectionStatus = ({ status }: ConnectionStatusProps) => (
  <output
    aria-live="polite"
    className={`connection-status connection-status--${status}`}
    data-status={status}
  >
    {status}
  </output>
)
