import "@xterm/xterm/css/xterm.css"
import { RegistryProvider } from "@effect/atom-react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "./app.tsx"
import { ToasterProvider } from "./components/toaster.tsx"

import "./styles.css"

const root = document.querySelector("#root")
if (!root) {
  throw new Error("Missing #root element")
}

createRoot(root).render(
  <StrictMode>
    <RegistryProvider>
      <ToasterProvider>
        <App />
      </ToasterProvider>
    </RegistryProvider>
  </StrictMode>
)
