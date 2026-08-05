import { env } from "../../config/env.js";

// MRAM SMS gateway helpers (msg.mram.com.bd). All calls use the master API key
// from the server env - it is never exposed to the frontend.

const ERROR_CODES: Record<string, string> = {
    "1002": "Sender ID / masking not found",
    "1003": "API not found",
    "1004": "SPAM detected",
    "1005": "Gateway internal error",
    "1006": "Gateway internal error",
    "1007": "Gateway balance insufficient",
    "1008": "Message is empty",
    "1009": "Message type not set",
    "1010": "Invalid user & password",
    "1011": "Invalid user id",
    "1012": "Invalid number",
    "1013": "API limit reached",
    "1014": "No matching template",
    "1015": "SMS content validation failed",
    "1016": "IP address not allowed",
    "1019": "SMS purpose missing",
};

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

        // On failure MRAM returns one of the numeric error codes (as the body).
        const codeMatch = raw.match(/\b(10[0-1][0-9])\b/);
        if (codeMatch && ERROR_CODES[codeMatch[1]]) {
            return { success: false, error: ERROR_CODES[codeMatch[1]], shootId: "", raw };
        }
        if (!res.ok) {
            return { success: false, error: `Gateway responded ${res.status}`, shootId: "", raw };
        }
        // Anything else is treated as success; the body is the SMS Shoot ID.
        return { success: true, error: "", shootId: raw, raw };
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
