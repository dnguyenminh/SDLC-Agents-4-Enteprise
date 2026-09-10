// Public entry point for the Tier-2 slash command module (SA4E-192).
// Re-exporting the singleton `slashMenu` and `registerAll` from a single
// location guarantees that every consumer (backend bootstrap, tests, future
// dispatchers) shares the SAME module instance — avoiding duplicate
// SlashMenuController singletons when imported via different relative paths.
export { slashMenu } from "./controller";
export {
  registerAll,
  copy,
  debug,
  help,
  init,
  sessions,
  skills,
  status,
  thinking,
} from "./commands/handlers";
