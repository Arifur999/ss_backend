import status from "http-status";
import type { SmsPurchase, User } from "../../../generated/prisma/client.js";
import AppError from "../../errorHelpers/AppError.js";
import { IRequestUser } from "../../interfaces/requestUser.interface.js";
import { prisma } from "../../lib/prisma.js";
import { logAdminActivity } from "../../utils/activityLog.js";
import { escapeHtml, sendTemplatedEmail } from "../../utils/email.js";
import {
    countSegments,
    getMramBalance,
    isUnicodeMessage,
    normalizeNumber,
    sendSms as sendViaGateway,
} from "../../utils/mram.js";
import {
    ICreateSmsPackagePayload,
    ISendSmsPayload,
    ISubmitSmsPurchasePayload,
    IUpdateSmsPackagePayload,
    IUpdateSmsPurchasePayload,
} from "./sms.validation.js";

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

// Every owner has exactly one credit wallet; created lazily on first access.
const getOrCreateWallet = async (ownerId: string) => {
    const existing = await prisma.smsWallet.findUnique({ where: { owner_id: ownerId } });
    if (existing) return existing;
    return prisma.smsWallet.create({ data: { owner_id: ownerId, balance: 0 } });
};

const getMyWallet = async (user: IRequestUser) => {
    const wallet = await getOrCreateWallet(user.ownerId);
    return { balance: wallet.balance, updated_at: wallet.updated_at };
};

// ---------------------------------------------------------------------------
// Packages (owners see only active ones)
// ---------------------------------------------------------------------------

const getActivePackages = async () => {
    return prisma.smsPackage.findMany({
        where: { active: true },
        orderBy: { price: "asc" },
    });
};

// ---------------------------------------------------------------------------
// Purchases (owner side)
// ---------------------------------------------------------------------------

const submitPurchase = async (payload: ISubmitSmsPurchasePayload, user: IRequestUser) => {
    const pkg = await prisma.smsPackage.findUnique({ where: { id: payload.package_id } });
    if (!pkg || !pkg.active) {
        throw new AppError(status.NOT_FOUND, "SMS package not found or no longer available");
    }

    const duplicate = await prisma.smsPurchase.findFirst({ where: { trx_id: payload.trx_id } });
    if (duplicate) {
        throw new AppError(status.CONFLICT, "This transaction ID has already been submitted");
    }

    const purchase = await prisma.smsPurchase.create({
        data: {
            owner_id: user.ownerId,
            package_id: pkg.id,
            package_name: pkg.name,
            sms_count: pkg.sms_count,
            amount: pkg.price,
            status: "pending",
            method: "bkash_manual",
            sender_number: payload.sender_number,
            trx_id: payload.trx_id,
            invoice_no: `SMS-${Date.now()}`,
            notes: "Manual bKash SMS package purchase",
        },
    });

    await logAdminActivity({
        ownerId: user.ownerId,
        actorEmail: user.email,
        action: "sms_purchase_submitted",
        detail: `Submitted SMS package purchase "${pkg.name}" (${pkg.sms_count} SMS, trx: ${payload.trx_id}) - awaiting approval`,
    });

    return purchase;
};

const getMyPurchases = async (user: IRequestUser) => {
    return prisma.smsPurchase.findMany({
        where: { owner_id: user.ownerId },
        orderBy: { created_at: "desc" },
    });
};

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

const parseRecipients = (recipients: string | string[]): string[] => {
    const rawList = Array.isArray(recipients)
        ? recipients
        : String(recipients).split(/[\s,;]+/);
    const normalized = rawList
        .map((r) => normalizeNumber(r))
        // A valid BD number normalizes to 8801XXXXXXXXX (13 digits).
        .filter((n) => /^8801[0-9]{9}$/.test(n));
    return [...new Set(normalized)];
};

const sendSms = async (payload: ISendSmsPayload, user: IRequestUser) => {
    const numbers = parseRecipients(payload.recipients);
    if (numbers.length === 0) {
        throw new AppError(status.BAD_REQUEST, "No valid recipient numbers found");
    }

    const message = payload.message.trim();
    const unicode = isUnicodeMessage(message);
    const segments = countSegments(message, unicode);
    const creditsNeeded = segments * numbers.length;

    const wallet = await getOrCreateWallet(user.ownerId);
    if (wallet.balance < creditsNeeded) {
        throw new AppError(
            status.PAYMENT_REQUIRED,
            `Not enough SMS credits. This batch needs ${creditsNeeded} (${segments} segment(s) x ${numbers.length} recipient(s)), but your balance is ${wallet.balance}.`
        );
    }

    const result = await sendViaGateway(numbers.join("+"), message, "transactional");

    if (!result.success) {
        // Log the failed attempt but charge nothing.
        await prisma.smsMessage.create({
            data: {
                owner_id: user.ownerId,
                recipient_count: numbers.length,
                segments,
                credits_used: 0,
                message,
                is_unicode: unicode,
                status: "failed",
                shoot_id: "",
                response: result.error || result.raw || "Failed",
            },
        });
        throw new AppError(status.BAD_GATEWAY, result.error || "Could not send SMS");
    }

    // Success: deduct credits and log the batch atomically.
    const [, smsMessage] = await prisma.$transaction([
        prisma.smsWallet.update({
            where: { owner_id: user.ownerId },
            data: { balance: { decrement: creditsNeeded } },
        }),
        prisma.smsMessage.create({
            data: {
                owner_id: user.ownerId,
                recipient_count: numbers.length,
                segments,
                credits_used: creditsNeeded,
                message,
                is_unicode: unicode,
                status: "sent",
                shoot_id: result.shootId,
                response: result.raw,
            },
        }),
    ]);

    await logAdminActivity({
        ownerId: user.ownerId,
        actorEmail: user.email,
        action: "sms_sent",
        detail: `Sent SMS to ${numbers.length} recipient(s), used ${creditsNeeded} credit(s)`,
    });

    const updatedWallet = await prisma.smsWallet.findUnique({ where: { owner_id: user.ownerId } });

    return {
        message: smsMessage,
        recipients: numbers.length,
        segments,
        credits_used: creditsNeeded,
        balance: updatedWallet?.balance ?? 0,
    };
};

const getMyMessages = async (user: IRequestUser) => {
    return prisma.smsMessage.findMany({
        where: { owner_id: user.ownerId },
        orderBy: { created_at: "desc" },
        take: 100,
    });
};

// ---------------------------------------------------------------------------
// Super admin: packages CRUD
// ---------------------------------------------------------------------------

const getAllPackages = async () => {
    return prisma.smsPackage.findMany({ orderBy: { price: "asc" } });
};

const createPackage = async (payload: ICreateSmsPackagePayload) => {
    return prisma.smsPackage.create({
        data: {
            name: payload.name,
            sms_count: payload.sms_count,
            price: payload.price,
            active: payload.active ?? true,
        },
    });
};

const updatePackage = async (id: string, payload: IUpdateSmsPackagePayload) => {
    const pkg = await prisma.smsPackage.findUnique({ where: { id } });
    if (!pkg) throw new AppError(status.NOT_FOUND, "SMS package not found");
    return prisma.smsPackage.update({ where: { id }, data: payload });
};

const deletePackage = async (id: string) => {
    const pkg = await prisma.smsPackage.findUnique({ where: { id } });
    if (!pkg) throw new AppError(status.NOT_FOUND, "SMS package not found");
    await prisma.smsPackage.delete({ where: { id } });
    return { id };
};

// ---------------------------------------------------------------------------
// Super admin: purchases + approval
// ---------------------------------------------------------------------------

const getAllPurchases = async () => {
    const purchases = await prisma.smsPurchase.findMany({
        orderBy: { created_at: "desc" },
        include: { owner: { select: { full_name: true, email: true } } },
    });
    return purchases.map((p) => ({
        ...p,
        owner_name: p.owner?.full_name || "",
        owner_email: p.owner?.email || "",
    }));
};

const updatePurchaseStatus = async (
    id: string,
    payload: IUpdateSmsPurchasePayload,
    admin: IRequestUser
) => {
    const purchase = await prisma.smsPurchase.findUnique({ where: { id } });
    if (!purchase) throw new AppError(status.NOT_FOUND, "SMS purchase not found");

    const justApproved = payload.status === "paid" && purchase.status !== "paid";

    const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.smsPurchase.update({
            where: { id },
            data: { status: payload.status },
        });

        // Approving a payment tops up the owner's wallet with the pack credits.
        if (justApproved) {
            await tx.smsWallet.upsert({
                where: { owner_id: purchase.owner_id },
                create: { owner_id: purchase.owner_id, balance: purchase.sms_count },
                update: { balance: { increment: purchase.sms_count } },
            });
        }

        return next;
    });

    await logAdminActivity({
        ownerId: purchase.owner_id,
        actorEmail: admin.email,
        action: "sms_purchase_updated",
        detail: `SMS purchase ${purchase.invoice_no} marked as ${payload.status}${justApproved ? ` (+${purchase.sms_count} credits)` : ""}`,
    });

    if (justApproved) {
        const owner = await prisma.user.findUnique({ where: { id: purchase.owner_id } });
        if (owner?.email) {
            void sendTemplatedEmail(
                owner.email,
                `SMS package invoice - ${updated.invoice_no}`,
                buildSmsInvoiceHtml(owner, updated)
            );
        }
    }

    return updated;
};

// Master (platform) SMS balance held with MRAM.
const getMasterBalance = async () => {
    return getMramBalance();
};

// Renders the SMS-package purchase invoice email sent to an owner on approval.
const buildSmsInvoiceHtml = (owner: User, purchase: SmsPurchase) => {
    const money = (n: number) => `Tk ${Number(n || 0).toLocaleString("en-US")}`;
    const day = (d?: Date | null) =>
        d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";
    // Escaped for the same reason as the plan invoice: package_name and trx_id
    // are owner-supplied and end up inside emailed HTML.
    const row = (label: string, value: string, bold = false) =>
        `<tr><td style="padding:8px 0;color:#64748b;">${label}</td><td style="padding:8px 0;text-align:right;${bold ? "font-weight:600;" : ""}">${escapeHtml(value)}</td></tr>`;

    return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
      <div style="background:#0b0b0f;color:#ffffff;padding:20px 24px;border-radius:12px 12px 0 0;">
        <h2 style="margin:0;font-size:20px;">SMS Package Invoice</h2>
        <p style="margin:4px 0 0;font-size:13px;color:#cbd5e1;">Invoice #${escapeHtml(purchase.invoice_no)}</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
        <p style="margin:0 0 16px;font-size:14px;">Hi ${escapeHtml(owner.full_name) || "there"}, thank you for your purchase - your SMS credits have been added to your wallet.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${row("Package", purchase.package_name || "-", true)}
          ${row("SMS credits", `${purchase.sms_count}`, true)}
          ${row("Purchase date", day(purchase.date))}
          ${row("Method", "bKash (manual)")}
          ${row("Transaction ID", purchase.trx_id || "-")}
          ${row("Paid from", purchase.sender_number || "-")}
        </table>
        <div style="margin-top:16px;padding:16px;background:#f1f5f9;border-radius:10px;">
          <table style="width:100%;"><tr>
            <td style="font-weight:700;font-size:15px;">Amount paid</td>
            <td style="text-align:right;font-weight:800;font-size:22px;">${money(Number(purchase.amount))}</td>
          </tr></table>
        </div>
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">This is a system-generated invoice for your records.</p>
      </div>
    </div>`;
};

export const SmsService = {
    getMyWallet,
    getActivePackages,
    submitPurchase,
    getMyPurchases,
    sendSms,
    getMyMessages,
    // super admin
    getAllPackages,
    createPackage,
    updatePackage,
    deletePackage,
    getAllPurchases,
    updatePurchaseStatus,
    getMasterBalance,
};
