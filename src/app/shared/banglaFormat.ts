// ---------------------------------------------------------------------------
// Bangla numerals, dates and plan names, for the emails customers read.
//
// Written out rather than left to toLocaleDateString("bn-BD"): the API runs in
// a slim Docker image, and a Node built without full ICU silently falls back
// to English there. An email that reads "07 Dec 2026" to half the customers
// and "০৭ ডিসেম্বর ২০২৬" to the other half, depending on which machine sent
// it, is worse than either.
// ---------------------------------------------------------------------------

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export const BN_MONTHS = [
    "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
    "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];

/** Every 0-9 in the text becomes its Bangla numeral; everything else is left alone. */
export function toBanglaDigits(value: string | number): string {
    return String(value ?? "").replace(/[0-9]/g, (digit) => BN_DIGITS[Number(digit)]!);
}

/**
 * A date as a Bangladeshi reader expects it: ০৭ ডিসেম্বর ২০২৬.
 *
 * Returns "" for a date that cannot be read, so a template prints nothing
 * rather than "Invalid Date" - the same rule the gift-card email follows.
 */
export function formatBanglaDate(value: Date | string | null | undefined): string {
    if (value === null || value === undefined || value === "") return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const day = toBanglaDigits(String(date.getDate()).padStart(2, "0"));
    const month = BN_MONTHS[date.getMonth()];
    const year = toBanglaDigits(date.getFullYear());
    return `${day} ${month} ${year}`;
}

/**
 * The plan, in words.
 *
 * The reminder used to print plan_type straight out of the database, so a
 * customer on a trial was told their "free_trial plan" was expiring. The
 * column name is not a word anybody says.
 */
export function banglaPlanLabel(planType: string | null | undefined): string {
    switch (String(planType || "").toLowerCase()) {
        case "free_trial":
            return "ফ্রি ট্রায়াল";
        case "monthly":
            return "মাসিক";
        case "yearly":
            return "বার্ষিক";
        default:
            return String(planType || "");
    }
}
