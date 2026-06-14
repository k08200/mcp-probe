# MCP server recipe guide

Recipes are sidecar files that turn an MCP server check from "the server starts"
into "CI exercised the call paths an agent depends on."

Good recipes are intentionally boring. They use safe read-only calls, assert
stable result shape, and avoid secrets in inputs, outputs, and receipts.

## Start from discovery

```bash
npx @k08200/mcp-probe@latest init \
  --target <your-mcp-server> \
  --discover \
  --lock-tools \
  --github-actions
```

This creates:

- `mcp-probe.config.json`
- `.mcp-probe.json`
- `.github/workflows/mcp-probe.yml`

Review `.mcp-probe.json` before running it with production credentials.
Remove mutating, admin, export, email-send, delete, or environment-inspection
tools unless you are intentionally writing a negative probe for a denied action.

## What to include

Each submitted recipe should include:

- server package name or endpoint shape
- transport: `stdio`, `http`, or `sse`
- auth model: none, static token, OAuth/browser handoff, service account
- expected tool catalog
- sidecar samples for read-only calls
- expected auth/permission failure behavior when relevant
- receipt artifact command
- notes about redaction and CI secrets

## Positive read-only probe

Use this for calls that should succeed:

```json
{
  "tools": {
    "logs_query": {
      "input": {
        "query": "service:web status:error",
        "timeframe": "1h"
      },
      "expect": {
        "status": "pass",
        "requiredFields": ["source", "freshness"],
        "maxRows": 100,
        "jsonSchema": {
          "type": "object",
          "required": ["source", "freshness"],
          "properties": {
            "source": { "type": "string" },
            "freshness": { "type": "string" }
          }
        }
      }
    }
  }
}
```

## Negative denied-action probe

Use this only when the server safely refuses the action.

```json
{
  "tools": {
    "delete_user_denied": {
      "input": {
        "user_id": "placeholder"
      },
      "expect": {
        "status": "fail",
        "errorCode": "PERMISSION_DENIED",
        "notContains": ["DATABASE_URL", "password", "stack", "token"]
      }
    }
  }
}
```

If the server does not expose a safe denied-write tool, skip this. Do not invent
a destructive call just to test denial.

## Auth-handoff probe

For OAuth/browser-auth servers, CI often cannot complete browser redirect
flows. That is useful information when it is explicit and stable.

```json
{
  "tools": {
    "profile_read": {
      "input": {},
      "expect": {
        "status": "warn",
        "not_error_code": [401, 403],
        "notContains": ["access_token", "refresh_token", "client_secret"]
      }
    }
  }
}
```

## Retry transient downstream failures

Use retry only for errors that are plausibly transient. Do not retry stable
permission failures, missing scopes, malformed inputs, or contract assertion
failures.

```json
{
  "tools": {
    "logs_query": {
      "input": {
        "query": "service:web status:error",
        "timeframe": "1h"
      },
      "retry": {
        "attempts": 3,
        "delayMs": 1000,
        "retryOn": [429, 500, 502, 503, 504, "timeout", "rate limit"]
      },
      "expect": {
        "status": "pass",
        "requiredFields": ["source", "freshness"]
      }
    }
  }
}
```

Retry attempts are recorded in JSON output and receipt artifacts. A probe that
passes after retry is still a pass, but the receipt shows that the downstream
was flaky. When `--github-summary` is enabled, retry receipts are also shown in
the Actions job summary for quick PR review.

## Run with receipts

```bash
npx @k08200/mcp-probe@latest \
  --config mcp-probe.config.json \
  --github-summary \
  --fail-on-warn \
  --receipt-file mcp-probe.receipt.json
```

Upload `mcp-probe.receipt.json` as a CI artifact. Receipts should prove the
probe ran without leaking tokens, private URLs, tenant IDs, customer data,
email subjects, row contents, or stack traces with internals.

## Track retry trends

Store receipt artifacts from repeated CI runs, then aggregate them:

```bash
npx @k08200/mcp-probe@latest trends ./receipts \
  --dashboard-file mcp-probe-trends.html \
  -o markdown
```

The markdown output is suitable for PR comments or scheduled reports. The HTML
dashboard groups retry receipts by day and by server/tool so recovered
transients and unresolved downstream failures can be tracked separately over
time.

## Redaction checklist

Before opening an issue or PR, remove:

- API keys, bearer tokens, OAuth tokens, refresh tokens
- tenant IDs, project IDs, customer IDs
- private URLs and internal hostnames
- email addresses, subjects, message bodies
- database URLs, connection strings, table row data
- stack traces containing local paths or secrets

Use placeholders such as `${DATADOG_MCP_TOKEN}`, `YOUR_PROJECT_ID`, and
`example.com`.

## Recipe quality bar

A useful recipe answers:

- Did `initialize` work?
- Did `tools/list` expose the expected catalog?
- Did CI call at least one real read-only tool?
- Did the output shape match what an agent depends on?
- Were row limits, freshness/provenance, or tenant/project scope represented?
- Did denied requests fail with stable structured errors?
- Did the receipt prove the probe actually ran?

If the recipe only proves that the process starts, it is a smoke test, not a
readiness gate.
