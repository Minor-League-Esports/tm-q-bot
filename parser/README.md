# Parser

This directory contains the Google Apps Script replay submission and verification app used by the bot.

It was moved in from the former `tm-gas-parser` repository so the bot and parser can evolve in one codebase.

Key files:

- `Code.js`: Apps Script entry points and replay parsing flow
- `Repository.js`: database queries and write paths
- `Database.js`: JDBC connection setup
- `Index.html`: replay submission UI
- `Verify.html`: replay verification and results UI
- `appsscript.json`: Apps Script manifest
