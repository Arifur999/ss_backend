import status from "http-status";
import AppError from "../errorHelpers/AppError.js";

// Confirms that an id the client sent points at a row in their own workspace.
//
// Reads, updates and deletes already scope every query by owner_id, so this is
// about the one direction that did not: a foreign key supplied when CREATING a
// row. Nothing checked that a supplier_id or product_id in the request belonged
// to the caller, and the id is the only thing needed to link to it - so posting
// another workspace's supplier id attached their supplier to your product, and
// the response (which includes the supplier) handed back their name, phone and
// address.
//
// This only ever rejects a reference that was already wrong. A create that used
// the caller's own records - which is every create the app itself makes - is
// unaffected, so no existing figure changes.
export const assertOwnedRecord = async (
    finder: () => Promise<{ id: string } | null>,
    label: string
): Promise<void> => {
    const found = await finder();
    if (!found) {
        // Deliberately the same message an unknown id would produce: whether
        // the row exists in someone else's workspace is not the caller's
        // business to learn.
        throw new AppError(status.NOT_FOUND, `${label} not found`);
    }
};
