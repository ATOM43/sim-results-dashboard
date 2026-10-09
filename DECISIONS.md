# Decisions

## Frontend lint and format: oxlint + Prettier

The plan called for ESLint + Prettier. The Vite template ships oxlint, which covers the same lint rules and runs much faster, so it stays as the linter. Prettier handles formatting. `make lint` runs both.
