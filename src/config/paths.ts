import path from "node:path"

/** The user's home directory, falling back to the current directory. */
export const home = process.env.HOME ?? process.cwd()

/** Base directory for user configuration (`XDG_CONFIG_HOME`, falling back to `~/.config`). */
export const configHome =
  process.env.XDG_CONFIG_HOME ?? path.join(home, ".config")

/** Directory holding cterm's own configuration. */
export const ctermConfigDir = path.join(configHome, "cterm")

/** Path to cterm's configuration file. */
export const configPath = path.join(ctermConfigDir, "config.json")

/** Path to cterm's vetted pi model list. */
export const modelsPath = path.join(ctermConfigDir, "models.json")
