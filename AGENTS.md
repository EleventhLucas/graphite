# Agent Instructions

Local-only agent and development instructions belong in `AGENTS_LOCAL.md`.
Read `AGENTS_LOCAL.md` after this file when it exists. It must remain gitignored and must not be committed.
When it is absent, continue normally and inform the user once that they may create it for machine-specific paths, ports, launch notes, and repo-local Git identity.
Never store passwords, access tokens, private keys, or other secrets in either agent file.

## Documentation and Text Files

- Keep `README.md` and `CONTRIBUTING.md` intentionally slim.
- Finalize edited text files with CRLF line endings.

## Privacy and Network Behavior

- Do not add telemetry, automatic diagnostic uploads, content logging, raw path logging, command-output logging, or unapproved network calls.
- Do not commit PII, credentials, personal paths, private configuration, or copied transcripts.
- Keep Graphite's runtime local and offline. User-initiated external links may open in the system browser.

## Portable Workflows

- Use repository-relative paths, environment variables, or checked-in wrappers instead of personal paths.
- Put machine-specific paths and notes in ignored `AGENTS_LOCAL.md` or `.env.local`.
- A wrapper for a variably installed executable must accept an environment override, check `PATH`, and fail with actionable setup help.

## Validation

- Default to quick, targeted validation.
- Do not run history rewrites, garbage collection, packaging, or full end-to-end suites unless explicitly requested.
- State the purpose of potentially long or destructive commands and keep their scope bounded.
