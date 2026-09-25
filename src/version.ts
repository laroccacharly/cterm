import pkg from "../package.json" with { type: "json" }

/** Current version of cterm, sourced from package.json. */
export const version: string = pkg.version
