import { env } from "../../config/env.js";
import { classifyMramReply } from "../shared/mramReply.js";

// MRAM SMS gateway helpers (msg.mram.com.bd). All calls use the master API key
// from the server env - it is never exposed to the frontend.
//
// Reading the reply is in shared/mramReply.ts, where it can be tested: this
// file imports config/env.ts for the API key, and a test that pulls in env
// fails in CI where there is no .env.

// Bangla (or any non-ASCII) content must go out as "unicode". Any char code
// above 127 means the message is outside the plain-GSM/ASCII set.
export const isUnicodeMessage = (message: string) => {
    for (let i = 0; i < message.length; i++) {
        if (message.charCodeAt(i) > 127) return true;
    }
    return false;
};

// SMS segment count: 160 chars/segment for text (153 when concatenated),
// 70 chars/segment for unicode (67 when concatenated).
export const countSegments = (message: string, unicode: boolean) => {
    const len = message.length;
    if (len === 0) return 1;
    if (unicode) return len <= 70 ? 1 : Math.ceil(len / 67);
    return len <= 160 ? 1 : Math.ceil(len / 153);
};

// Normalize a BD mobile number to the 8801XXXXXXXXX form MRAM expects.
export const normalizeNumber = (phone: string) => {
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.startsWith("880")) return digits;
    if (digits.startsWith("0")) return "88" + digits; // 01712345678 -> 8801712345678
    if (digits.startsWith("1") && digits.length === 10) return "880" + digits;
    return digits;
};

export const isMramConfigured = () => Boolean(env.MRAM.API_KEY && env.MRAM.SENDER_ID);

export interface MramSendResult {
    success: boolean;
    error: string;
    shootId: string;
    /**
     * Exactly what the gateway said, kept whatever the outcome.
     *
     * The caller writes this to sms_messages.response. It used to store the
     * error message we had DERIVED from the body instead, which meant the one
     * piece of evidence - the gateway's own words - was thrown away at the
     * moment it started being needed.
     */
    raw: string;
}

// Send one SMS batch. `contacts` is one or more normalized numbers joined by "+".
export const sendSms = async (
    contacts: string,
    message: string,
    label: "transactional" | "promotional" = "transactional"
): Promise<MramSendResult> => {
    if (!isMramConfigured()) {
        return { success: false, error: "SMS gateway is not configured yet", shootId: "", raw: "" };
    }

    const params = new URLSearchParams({
        api_key: env.MRAM.API_KEY,
        type: isUnicodeMessage(message) ? "unicode" : "text",
        contacts,
        senderid: env.MRAM.SENDER_ID,
        msg: message,
        label,
    });

    try {
        const res = await fetch(`${env.MRAM.BASE_URL}/smsapi?${params.toString()}`, { method: "GET" });
        const raw = (await res.text()).trim();
        const verdict = classifyMramReply({ raw, ok: res.ok, status: res.status });
        return { success: verdict.success, error: verdict.error, shootId: verdict.shootId, raw };
    } catch (err) {
        const reason = err instanceof Error ? err.message : "";
        return { success: false, error: reason || "Could not reach the SMS gateway", shootId: "", raw: "" };
    }
};

// Master account SMS balance (what the platform has left with MRAM).
export const getMramBalance = async (): Promise<{ success: boolean; balance: number | null; raw: string }> => {
    if (!env.MRAM.API_KEY) return { success: false, balance: null, raw: "not configured" };
    try {
        const res = await fetch(`${env.MRAM.BASE_URL}/miscapi/${env.MRAM.API_KEY}/getBalance`);
        const raw = (await res.text()).trim();
        const num = Number(raw.replace(/[^\d.]/g, ""));
        return { success: res.ok, balance: Number.isNaN(num) ? null : num, raw };
    } catch (err) {
        return { success: false, balance: null, raw: err instanceof Error ? err.message : "" };
    }
};
