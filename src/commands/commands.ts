import { Schema } from "effect"

/**
 * A command is an action that can be discovered and run from the Commands
 * page. Unlike shortcuts, commands are not buttons in the terminal header.
 *
 * The action is data so the server can describe a command and the browser can
 * execute it without duplicating the catalogue.
 */
const InputActionSchema = Schema.Struct({
  data: Schema.String,
  type: Schema.Literal("input"),
})

const FontSizeActionSchema = Schema.Struct({
  delta: Schema.Number,
  type: Schema.Literal("font-size"),
})

export const CommandActionSchema = Schema.Union([
  InputActionSchema,
  FontSizeActionSchema,
])

export const CommandSchema = Schema.Struct({
  action: CommandActionSchema,
  description: Schema.String,
  id: Schema.String,
  label: Schema.String,
})

export type Command = typeof CommandSchema.Type

export const CommandsResponseSchema = Schema.Struct({
  commands: Schema.Array(CommandSchema),
})

export type CommandsResponse = typeof CommandsResponseSchema.Type

/** Catalogue of commands exposed by the `/commands` endpoint. */
export const commands: readonly Command[] = [
  {
    action: { data: "/new\r", type: "input" },
    description: "Start a fresh shell session in the current directory.",
    id: "new-session",
    label: "New session",
  },
  {
    action: { delta: 1, type: "font-size" },
    description: "Make the terminal text one step larger.",
    id: "font-increase",
    label: "Increase font size",
  },
  {
    action: { delta: -1, type: "font-size" },
    description: "Make the terminal text one step smaller.",
    id: "font-decrease",
    label: "Decrease font size",
  },
]

export const commandsResponse: CommandsResponse = { commands: [...commands] }
