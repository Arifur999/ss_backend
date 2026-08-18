import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { DEFAULT_REMINDER_BODY, DEFAULT_REMINDER_SUBJECT } from "../../utils/defaultReminderTemplate.js";
import { renderTemplate, sendTemplatedEmail } from "../../utils/email.js";
import { buildPlanGiftCardHtml, planGiftCardSubject } from "../../utils/giftCard.js";
import { renewUrl } from "../../utils/subscriptionReminders.js";
import { IUpdatePlatformSettingsPayload } from "./platformSettings.validation.js";

// This table only ever has one row. Every read/write goes through this
// helper so callers never have to know or guess an id - it creates the row
// with sane defaults (including the built-in reminder template) on first use.
const getOrCreateSettings = async () => {
    const existing = await prisma.platformSetting.findFirst();
    if (existing) return existing;

    return prisma.platformSetting.create({
        data: {
            reminder_subject: DEFAULT_REMINDER_SUBJECT,
            reminder_body: DEFAULT_REMINDER_BODY,
        },
    });
};

// Public-ish surface (any authenticated user) for the checkout/plans pages -
// deliberately excludes the reminder email template.
const getPaymentInfo = async () => {
    const settings = await getOrCreateSettings();
    return {
        bkash_number: settings.bkash_number,
        bkash_qr_url: settings.bkash_qr_url,
        yearly_price: settings.yearly_price,
        yearly_original_price: settings.yearly_original_price,
        monthly_price: settings.monthly_price,
        support_number: settings.support_number,
    };
};

// Full row for the super admin settings page (includes the email template).
const getFullSettings = async () => getOrCreateSettings();

const updateSettings = async (payload: IUpdatePlatformSettingsPayload) => {
    const settings = await getOrCreateSettings();

    return prisma.platformSetting.update({
        where: { id: settings.id },
        data: payload,
    });
};

// Restore the reminder subject + body to the built-in default template. Used
// by the "Reset to default" button so an already-saved (older) template can be
// refreshed to the current default - e.g. to pick up the "Payment Now" button.
const resetReminderTemplate = async () => {
    const settings = await getOrCreateSettings();

    return prisma.platformSetting.update({
        where: { id: settings.id },
        data: {
            reminder_subject: DEFAULT_REMINDER_SUBJECT,
            reminder_body: DEFAULT_REMINDER_BODY,
        },
    });
};

// "Send test email" button: renders the current template with placeholder
// sample data and mails it to the super admin themselves, so template edits
// can be previewed without waiting for a real expiry to roll around.
const sendTestReminder = async (admin: IRequestUser) => {
    const settings = await getOrCreateSettings();

    const vars = {
        name: admin.name || "Owner",
        business_name: "Sample Business",
        days_left: 7,
        expiry_date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        plan: "Yearly",
        renew_url: renewUrl(),
    };

    const subject = renderTemplate(settings.reminder_subject, vars);
    const html = renderTemplate(settings.reminder_body, vars);

    const sent = await sendTemplatedEmail(admin.email, subject, html);

    return { sent, subject, html };
};

/**
 * Sends the plan welcome card - the email an owner gets when their payment is
 * approved - filled with sample figures, so the super admin can see exactly
 * what a customer receives without approving a real payment first.
 *
 * `to` is optional and defaults to the admin's own address; the route is super
 * admin only, so an arbitrary address here is a deliberate choice by the person
 * who owns the mail domain, not something a customer can point anywhere.
 */
const sendTestGiftCard = async (admin: IRequestUser, to?: string) => {
    const settings = await getOrCreateSettings();
    const recipient = String(to || "").trim() || admin.email;

    const purchase = new Date();
    const expiry = new Date(purchase);
    expiry.setMonth(expiry.getMonth() + 12);

    const html = buildPlanGiftCardHtml({
        ownerName: admin.name || "Owner",
        businessName: "Sample Furniture House",
        planType: "yearly",
        amount: Number(settings.yearly_price),
        invoiceNo: "INV-SAMPLE-0001",
        trxId: "9J7K2L1M0N",
        senderNumber: "01XXXXXXXXX",
        purchaseDate: purchase,
        expiryDate: expiry,
        supportNumber: settings.support_number,
    });

    const subject = planGiftCardSubject("yearly");
    const sent = await sendTemplatedEmail(recipient, subject, html);

    return { sent, to: recipient, subject };
};

export const PlatformSettingsService = {
    getPaymentInfo,
    getFullSettings,
    updateSettings,
    resetReminderTemplate,
    sendTestReminder,
    sendTestGiftCard,
};
