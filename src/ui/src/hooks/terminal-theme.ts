import type { ITheme } from "@xterm/xterm"

export const terminalFontFamily =
  '"Berkeley Mono", "JetBrains Mono", "SFMono-Regular", Consolas, monospace'

/** Tokyo Night colors shared by the live terminal and its scrollback view. */
export const terminalTheme: ITheme = {
  background: "#1a1b26",
  black: "#1a1b26",
  blue: "#7aa2f7",
  brightBlack: "#414868",
  brightBlue: "#7da6ff",
  brightCyan: "#0db9d7",
  brightGreen: "#b9f27c",
  brightMagenta: "#bb9af7",
  brightRed: "#ff7a93",
  brightWhite: "#c0caf5",
  brightYellow: "#ff9e64",
  cursor: "#c0caf5",
  cyan: "#449dab",
  foreground: "#a9b1d6",
  green: "#9ece6a",
  magenta: "#ad8ee6",
  red: "#f7768e",
  selectionBackground: "#292e42",
  selectionForeground: "#c0caf5",
  white: "#a9b1d6",
  yellow: "#e0af68",
}
