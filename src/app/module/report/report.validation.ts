import z from "zod";

// ---------------------------------------------------------------------------
// Emailing the report that is on screen.
//
// The figures come from the browser already formatted - "Tk 1,24,496", or the
// Bangla digits if that is the language in use - so the email reads exactly
// like the page it was sent from. Recomputing them here would mean a second
// copy of seven hundred lines of report arithmetic, and the two would drift.
//
// What makes that safe is the recipient: the service ignores anything the
// request might say about who to send to and uses the signed-in owner's own
// address. The worst a tampered payload can do is email its author numbers
// they made up.
//
// The caps are there so one request cannot turn into a megabyte of email.
// ---------------------------------------------------------------------------

const line = z.string().max(120);

const summaryRowZodSchema = z.object({
    label: line,
    value: line,
});

const tableZodSchema = z.object({
    title: line,
    columns: z.array(line).max(10, "A table can carry at most 10 columns"),
    rows: z.array(z.array(line).max(10)).max(200, "A table can carry at most 200 rows"),
});

export const emailReportZodSchema = z.object({
    title: line.min(1, "Report title is required"),
    period: line,
    summary: z.array(summaryRowZodSchema).max(40, "At most 40 summary figures"),
    tables: z.array(tableZodSchema).max(10, "At most 10 tables"),
});

export type IEmailReportPayload = z.infer<typeof emailReportZodSchema>;
