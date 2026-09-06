import z from "zod";

// ---------------------------------------------------------------------------
// A parked purchase order or invoice.
//
// `data` is the form exactly as it stood, and the server does not look inside
// it - which is the whole reason drafts are safe to keep. A draft is usually
// incomplete, so validating its contents the way createPurchase/createSale do
// would refuse precisely the forms this feature exists to save.
//
// What IS checked is size, for the same reason report.validation.ts caps its
// payload: this is composed in a browser, and without a ceiling one click could
// park a megabyte. 256 KB is far above any real order - a hundred-line purchase
// snapshot is a few kilobytes - and far below anything worth worrying about.
// ---------------------------------------------------------------------------

export const DRAFT_KINDS = ["purchase_order", "sale"] as const;

const MAX_DATA_BYTES = 256 * 1024;

const line = z.string().max(200);

export const saveDraftZodSchema = z.object({
    kind: z.enum(DRAFT_KINDS, "Draft kind must be purchase_order or sale"),
    title: line.optional(),
    subtitle: line.optional(),
    amount: z.number("Amount must be a number").optional(),
    // Which shape `data` is in. The page refuses a stamp it does not know
    // rather than hydrating a form half-way - see lib/draftPayload.ts.
    payload_version: z.number("Payload version must be a number").int().min(1).optional(),
    // An object, but an opaque one. Unknown values rather than `any` so nothing
    // downstream can read a field off it without deciding what it is first.
    data: z.record(z.string(), z.unknown(), "Draft data must be an object"),
}).superRefine((payload, ctx) => {
    let size = 0;
    try {
        size = JSON.stringify(payload.data).length;
    } catch {
        // Circular or otherwise unserialisable - it could never have survived
        // the request body either, but say so plainly rather than throwing.
        ctx.addIssue({ code: "custom", path: ["data"], message: "Draft data could not be read" });
        return;
    }

    if (size > MAX_DATA_BYTES) {
        ctx.addIssue({
            code: "custom",
            path: ["data"],
            message: `This draft is too large to save (${Math.round(size / 1024)} KB, limit ${MAX_DATA_BYTES / 1024} KB)`,
        });
    }
});

export type IDraftKind = (typeof DRAFT_KINDS)[number];
export type ISaveDraftPayload = z.infer<typeof saveDraftZodSchema>;
