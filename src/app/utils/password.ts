import z from "zod";

/**
 * bcrypt hashes only the first 72 bytes of a password and silently ignores
 * everything after. That is not a theoretical limit: a 92-character password
 * authenticates against a completely different tail, because only the first 72
 * bytes ever reached the hash. Accepting a longer one would promise strength
 * the stored hash does not deliver.
 *
 * Bytes, not characters. Bangla runs three bytes to the character, so a
 * 24-character Bangla passphrase already reaches the ceiling while a
 * 72-character English one only just does.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

export const passwordByteLength = (value: string): number =>
    Buffer.byteLength(value, "utf8");

export const passwordFits = (value: string): boolean =>
    passwordByteLength(value) <= MAX_PASSWORD_BYTES;

/**
 * The one password rule, so registration, reset, and the two team-user routes
 * cannot drift onto four different answers.
 */
export const passwordSchema = () =>
    z
        .string("Password must be string")
        .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
        .refine(
            passwordFits,
            `Password must be at most ${MAX_PASSWORD_BYTES} bytes - about ${MAX_PASSWORD_BYTES} English characters, or ${Math.floor(MAX_PASSWORD_BYTES / 3)} Bangla`,
        );
