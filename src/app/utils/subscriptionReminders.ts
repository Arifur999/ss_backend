import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { renderTemplate, sendTemplatedEmail } from "./email.js";

// ---------------------------------------------------------------------------
// Expiry reminder emails.
//
// Runs once a day (see app.ts cron). For every ACTIVE owner subscription,
// works out whole days remaining until expiry and - if that number is
// exactly 15, 7 or 3 - sends the reminder email (using the super-admin
// editable template from PlatformSetting) exactly once.
//
// "Exactly once" is enforced by the ReminderLog unique constraint on
// (owner_id, days_before, expiry_date): if the owner later renews and gets a
// new expiry_date, the reminders naturally fire again for the new date.
// ---------------------------------------------------------------------------

const REMINDER_DAYS_BEFORE = [15, 7, 3] as const;

const daysUntil = (target: Date, now: Date) => {
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.ceil((target.getTime() - now.getTime()) / msPerDay);
};

const formatDate = (date: Date) =>
    date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export const sendExpiryReminders = async () => {
    const now = new Date();

    // Only subscriptions that are currently active can be "about to expire" -
    // trial/pending/blocked/already-expired ones are not reminder candidates.
    const activeSubscriptions = await prisma.ownerSubscription.findMany({
        where: {
            plan_status: "active",
            expiry_date: { gt: now },
        },
        include: { owner: true },
    });

    let sentCount = 0;

    for (const subscription of activeSubscriptions) {
        const daysLeft = daysUntil(subscription.expiry_date, now);

        if (!REMINDER_DAYS_BEFORE.includes(daysLeft as (typeof REMINDER_DAYS_BEFORE)[number])) {
            continue;
        }

        const settings = await prisma.platformSetting.findFirst();
        if (!settings) continue; // Not configured yet - nothing to send.

        const vars = {
            name: subscription.owner.full_name || "Owner",
            business_name: subscription.business_name || subscription.owner.full_name || "your business",
            days_left: daysLeft,
            expiry_date: formatDate(subscription.expiry_date),
            plan: subscription.plan_type,
        };

        const recipient = subscription.owner_email || subscription.owner.email;

        try {
            // Claim this (owner, days_before, expiry_date) slot FIRST. If two
            // cron ticks somehow overlap, the loser hits the unique
            // constraint and skips sending instead of double-mailing.
            await prisma.reminderLog.create({
                data: {
                    owner_id: subscription.owner_id,
                    days_before: daysLeft,
                    expiry_date: subscription.expiry_date,
                },
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                continue; // Already sent for this owner/days/expiry combo.
            }
            throw error;
        }

        const subject = renderTemplate(settings.reminder_subject, vars);
        const html = renderTemplate(settings.reminder_body, vars);
        await sendTemplatedEmail(recipient, subject, html);
        sentCount += 1;
    }

    if (sentCount > 0) {
        console.log(`Expiry reminders: sent ${sentCount} email(s)`);
    }

    return { sent: sentCount };
};
