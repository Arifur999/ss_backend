// HTML escaping, on its own so that building an email body does not drag in a
// mail provider.
//
// It used to live in email.ts, which imports config/env.ts - and env.ts throws
// at import time when DATABASE_URL is unset. That made every template builder
// untestable in CI, where there is no .env: the test failed on a missing
// database URL while testing a pure string function. Sending needs
// credentials; rendering does not.
//
// Values escaped here are typed by people - business names, transaction ids,
// full names - and land inside markup that is mailed out.
export const escapeHtml = (value: string) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[char] as string));
