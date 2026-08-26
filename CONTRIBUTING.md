# Contributing

Use common sense, be nice, and keep changes easy to understand.

## The Basics

- Be friendly.
- One clear change is easier to review than five tangled ones.
- Do not submit code, assets, or text you do not have the right to share.
- Do not add telemetry, surprise network calls, secrets, generated bundles, diagnostics, or local configuration.
- Match the style of nearby code. If something looks inconsistent, ask or keep it boring.

There is no CLA, copyright assignment, or DCO sign-off.

AI-assisted work is fine, but **you are responsible for what you submit**.

## Before Opening a Pull Request

Run the checks that match your change:

```text
bun run typecheck
bun run lint
bun run test
bun run build:web
```

Run `bun run test:smoke` for Electrobun, RPC, startup, or packaging changes.
