import z from "zod";

export const upsertBusinessSettingsZodSchema = z.object({
    name_bn: z.string("Business name (BN) must be string").optional(),
    name_en: z.string("Business name (EN) must be string").optional(),
    phone: z.string("Phone must be string").optional(),
    email: z.string("Email must be string").optional(),
    address: z.string("Address must be string").optional(),
    website: z.string("Website must be string").optional(),
    trade_license: z.string("Trade license must be string").optional(),
    logo_url: z.string("Logo URL must be string").optional(),
    currency_symbol: z.string("Currency symbol must be string").optional(),
});

export type IUpsertBusinessSettingsPayload = z.infer<typeof upsertBusinessSettingsZodSchema>;
