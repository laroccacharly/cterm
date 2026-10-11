import { Schema } from "effect"

/** Header carrying the URI-encoded name of an uploaded file. */
export const uploadFilenameHeader = "x-filename"

/** Successful response from `POST /upload`. */
export const UploadResponseSchema = Schema.Struct({
  path: Schema.String,
})

export type UploadResponse = typeof UploadResponseSchema.Type
