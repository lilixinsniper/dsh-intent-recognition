# Smoke test

Requires a local PostgreSQL with pgvector on 127.0.0.1:54329 (or edit the DSN
in smoke.mjs) and a database `dsh_intent`. Then:

    node test/smoke.mjs

It loads lib/index.js with a mock Cordis context, serves the management API on
port 18081, and runs the full pipeline against mock model endpoints on 18082.
