import z from "zod";

// Long enough for somebody to describe a real problem, short enough that a
// paste of their whole database does not land in the inbox.
const BODY_MAX = 4000;
const SUBJECT_MAX = 120;

export const createTicketZodSchema = z.object({
    subject: z.string("Subject must be string").max(SUBJECT_MAX, `Subject must be at most ${SUBJECT_MAX} characters`).optional(),
    message: z
        .string("Message must be string")
        .trim()
        .min(1, "Write your question before sending")
        .max(BODY_MAX, `Message must be at most ${BODY_MAX} characters`),
});

export const replyTicketZodSchema = z.object({
    message: z
        .string("Message must be string")
        .trim()
        .min(1, "Write a message before sending")
        .max(BODY_MAX, `Message must be at most ${BODY_MAX} characters`),
});

export type ICreateTicketPayload = z.infer<typeof createTicketZodSchema>;
export type IReplyTicketPayload = z.infer<typeof replyTicketZodSchema>;
