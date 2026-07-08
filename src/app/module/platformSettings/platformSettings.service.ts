import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { DEFAULT_REMINDER_BODY, DEFAULT_REMINDER_SUBJECT } from "../../utils/defaultReminderTemplate.js";
import { renderTemplate, sendTemplatedEmail } from "../../utils/email.js";
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
    };

    const subject = renderTemplate(settings.reminder_subject, vars);
    const html = renderTemplate(settings.reminder_body, vars);

    const sent = await sendTemplatedEmail(admin.email, subject, html);

    return { sent, subject, html };
};

export const PlatformSettingsService = {
    getPaymentInfo,
    getFullSettings,
    updateSettings,
    sendTestReminder,
};
