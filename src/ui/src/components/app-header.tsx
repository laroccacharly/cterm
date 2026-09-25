import type { ReactNode } from "react"

import type { ConnectionStatus as Status } from "../hooks/use-terminal.ts"
import { ConnectionStatus } from "./connection-status.tsx"
import { RefreshButton } from "./refresh-button.tsx"
import { ViewSwitcher } from "./view-switcher.tsx"
import type { View } from "./view-switcher.tsx"

interface AppHeaderProps {
  readonly controls: ReactNode
  readonly onViewChange: (view: View) => void
  readonly sessionTabs: ReactNode
  readonly status: Status
  readonly view: View
}

export const AppHeader = ({
  controls,
  onViewChange,
  sessionTabs,
  status,
  view,
}: AppHeaderProps) => (
  <header className="app-header">
    <div className="app-header__primary">
      <strong className="app-title">cterm</strong>
      <ViewSwitcher onChange={onViewChange} view={view} />
      <div className="app-header__status">
        <ConnectionStatus status={status} />
        <RefreshButton />
      </div>
    </div>
    {sessionTabs}
    {controls}
  </header>
)
