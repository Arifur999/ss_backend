import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { DEFAULT_REMINDER_BODY, DEFAULT_REMINDER_SUBJECT } from "./defaultReminderTemplate.js";

/**
 * The reminder template lives in two places at once, and has to.
 *
 * This constant seeds a NEW workspace. A migration rewrites the one already
 * sitting in platform_settings on workspaces that exist. If the two drift,
 * new customers and old customers get different emails and nobody notices
 * until one of them is quoted back at you.
 */
const MIGRATION = path.resolve(
    import.meta.dirname,
    "../../../prisma/migrations/20261126120000_bangla_reminder_template/migration.sql"
);

const migrationSql = readFileSync(MIGRATION, "utf8");

/** What the sender actually fills in - see subscriptionReminders.ts. */
const PROVIDED = ["name", "business_name", "days_left", "expiry_date", "plan", "renew_url"];

describe("the default reminder template", () => {
    it("is written in Bangla", () => {
        const bangla = /[ঀ-৿]/;
        assert.ok(bangla.test(DEFAULT_REMINDER_SUBJECT), "the subject is not in Bangla");
        assert.ok(bangla.test(DEFAULT_REMINDER_BODY), "the body is not in Bangla");
    });

    /**
     * A placeholder nobody fills renders as the literal "{{whatever}}" in a
     * customer's inbox: renderTemplate leaves an unknown key untouched.
     */
    it("asks only for values the sender provides", () => {
        const used = new Set(
            [...`${DEFAULT_REMINDER_SUBJECT}${DEFAULT_REMINDER_BODY}`.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)]
                .map((match) => match[1]!)
        );
        for (const key of used) {
            assert.ok(PROVIDED.includes(key), `{{${key}}} is in the template but nothing fills it`);
        }
    });

    it("still carries the things the email exists for", () => {
        assert.ok(DEFAULT_REMINDER_SUBJECT.includes("{{days_left}}"), "the subject must say how long is left");
        assert.ok(DEFAULT_REMINDER_BODY.includes("{{renew_url}}"), "the body must link to the payment page");
        assert.ok(DEFAULT_REMINDER_BODY.includes("{{expiry_date}}"), "the body must say when it expires");
    });

    it("matches the migration that updates existing workspaces", () => {
        assert.ok(
            migrationSql.includes(DEFAULT_REMINDER_SUBJECT),
            "the migration writes a different subject from the one new workspaces get"
        );
        assert.ok(
            migrationSql.includes(DEFAULT_REMINDER_BODY),
            "the migration writes a different body from the one new workspaces get"
        );
    });

    /**
     * The migration must only touch templates nobody has edited. Were the
     * WHERE clause dropped, a super admin's own wording would be silently
     * replaced on the next deploy.
     */
    it("only rewrites templates still on the old English default", () => {
        assert.ok(
            migrationSql.includes("WHERE reminder_body LIKE '%Renew now to avoid losing access%'"),
            "the migration would overwrite a customised template"
        );
    });
});
