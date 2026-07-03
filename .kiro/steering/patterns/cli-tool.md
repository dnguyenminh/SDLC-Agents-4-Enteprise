# Pattern: CLI Tool

## Description

Command-line application with argument parsing, subcommands, and terminal output. No web server or GUI.

## Signals

- Main entry with argument parsing (argparse, clikt, commander, clap)
- Subcommand structure
- No HTTP server or web framework
- Terminal output formatting (colors, tables, progress bars)
- Config file reading (~/.config or .rc files)
- Exit codes defined

## Pipeline Adjustments

### BRD Emphasis
- Command/subcommand structure
- Input/output format specifications
- User interaction flows (prompts, confirmations)
- Error messages and exit codes
- Shell completion requirements

### FSD Extra Considerations
- CLI flow diagrams (command → subcommand → action)
- Argument/option specification tables
- Output format examples (JSON, table, plain)
- Interactive vs non-interactive mode behavior
- Piping and stdin/stdout behavior
- Config file schema

### TDD Focus
- Command parsing architecture
- Plugin/extension system (if applicable)
- Output formatting strategy
- Config resolution order (env → file → args)
- Cross-platform considerations (Windows/Linux/Mac)

### Testing Priorities
- Command parsing tests (valid/invalid args)
- Output format verification (snapshot tests)
- Exit code correctness
- Interactive prompt testing
- Cross-platform path handling
- Large input handling (streaming)

### Deployment Considerations
- Binary distribution (native compile or fat JAR)
- Package managers (brew, apt, scoop, npm global)
- Shell completion scripts generation
- Man page / help text
- Auto-update mechanism

## Quality Criteria Adjustments

| Standard Criteria | CLI Tool Adjustment |
|-------------------|-------------------|
| Code coverage | + All subcommands exercised |
| API contracts | Argument schema + exit codes documented |
| Performance | Startup time < 200ms, large file streaming |
| Security | Input sanitization, no shell injection |
| Documentation | --help text + man page + examples |
