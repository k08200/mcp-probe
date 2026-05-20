# Security Policy

## Reporting Vulnerabilities

Please do not open a public issue for a security vulnerability.

Email the maintainer or create a private GitHub security advisory with:

- A clear description of the issue
- Steps to reproduce
- Impacted version
- Whether the issue can expose secrets, tokens, environment variables, or MCP tool outputs

## Scope

Security-sensitive areas include:

- Handling of HTTP headers and auth tokens
- JSON output that may be stored in CI logs
- Tool-call dry-run output
- Stderr capture and reporting
- Config file environment-variable interpolation

mcp-probe should never intentionally print secret values. If you find a case where a token or credential can be leaked into terminal, JSON, GitHub summary, or badge output, please report it.
