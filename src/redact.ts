const REDACTED = '[REDACTED]';

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, `$1${REDACTED}`],
  [/\b(Basic\s+)[A-Za-z0-9._~+/=-]{8,}/gi, `$1${REDACTED}`],
  [/((?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|secret)=)[^&\s]+/gi, `$1${REDACTED}`],
  [/("(?:apiKey|api_key|token|accessToken|access_token|refreshToken|refresh_token|clientSecret|client_secret|password|secret)"\s*:\s*")[^"]+(")/gi, `$1${REDACTED}$2`],
  [/((?:--api-key|--token|--access-token|--secret|--password)\s+)\S+/gi, `$1${REDACTED}`],
];

function uniqueSecretValues(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).filter((value) => value.length >= 8))];
}

export function redactText(text: string, secretValues?: string[]): string {
  let redacted = text;

  for (const [pattern, replacement] of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }

  for (const secret of uniqueSecretValues(secretValues)) {
    redacted = redacted.split(secret).join(REDACTED);
  }

  return redacted;
}

export function redactUnknown<T>(value: T, secretValues?: string[]): T {
  if (typeof value === 'string') {
    return redactText(value, secretValues) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item, secretValues)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactUnknown(item, secretValues)])
    ) as T;
  }

  return value;
}
