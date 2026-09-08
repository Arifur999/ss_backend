import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    EXPENSE, OTHER_INCOME, mirrorAmountOf, mirrorKindOf,
    needsExpenseCategory, needsIncomeSource, planLoanMirror,
} from "./loanProfitMirror.js";

// The rule the whole feature turns on: one twin, or none, and NEVER two.
//
// A profit row already moves cash through received_amount / payment_amount, and
// Balance.tsx folds those into the account. The twin it writes for the P&L
// carries no account, so the cash still moves once - but if the reconcile ever
// left two twins standing, or left one behind after a row was corrected, the
// profit and loss would be wrong by the amount of an interest payment and
// nothing on any screen would say so.
//
// So the transitions are pinned here one by one. The awkward one is a profit
// PAYMENT corrected to a profit RECEIPT: two things have to happen at once.

const receive = (amount: number, category = "profit") => ({
    transaction_type: "receive", payment_category: category,
    received_amount: amount, payment_amount: 0,
});

const pay = (amount: number, category = "profit") => ({
    transaction_type: "payment", payment_category: category,
    received_amount: 0, payment_amount: amount,
});

const nothing = { expense_id: null, other_income_id: null };
const hasExpense = { expense_id: "exp-1", other_income_id: null };
const hasIncome = { expense_id: null, other_income_id: "inc-1" };

describe("mirrorKindOf", () => {
    it("gives a principal row no twin, whichever way the money went", () => {
        assert.equal(mirrorKindOf(receive(10_000, "principal")), null);
        assert.equal(mirrorKindOf(pay(4_000, "principal")), null);
    });

    it("treats a row with no category at all as principal, so old rows are left alone", () => {
        assert.equal(mirrorKindOf({ received_amount: 0, payment_amount: 700 }), null);
    });

    it("files profit PAID as an expense - it is what borrowing cost", () => {
        assert.equal(mirrorKindOf(pay(5_000)), EXPENSE);
    });

    it("files profit RECEIVED as other income - it is what lending earned", () => {
        assert.equal(mirrorKindOf(receive(5_000)), OTHER_INCOME);
    });

    it("writes no twin for a profit row of Tk 0", () => {
        assert.equal(mirrorKindOf({ payment_category: "profit", received_amount: 0, payment_amount: 0 }), null);
    });

    it("goes by the money, not the label, when the two disagree", () => {
        // The amounts are what Balance.tsx sums, so they are what the twin has
        // to agree with. A row labelled receive carrying only a payment is a
        // repair job, not a receipt.
        assert.equal(mirrorKindOf({
            transaction_type: "receive", payment_category: "profit",
            received_amount: 0, payment_amount: 3_000,
        }), EXPENSE);
    });

    it("lets the label break a tie when a row somehow carries both", () => {
        const both = { payment_category: "profit", received_amount: 2_000, payment_amount: 3_000 };
        assert.equal(mirrorKindOf({ ...both, transaction_type: "receive" }), OTHER_INCOME);
        assert.equal(mirrorKindOf({ ...both, transaction_type: "payment" }), EXPENSE);
    });
});

describe("mirrorAmountOf", () => {
    it("is the paid figure for an expense and the received figure for income", () => {
        assert.equal(mirrorAmountOf(pay(2_950)), 2_950);
        assert.equal(mirrorAmountOf(receive(1_560)), 1_560);
    });

    it("rounds to whole taka, like every other figure on the site", () => {
        assert.equal(mirrorAmountOf(pay(2_949.6)), 2_950);
    });

    it("is 0 where there is no twin", () => {
        assert.equal(mirrorAmountOf(pay(4_000, "principal")), 0);
    });
});

describe("planLoanMirror", () => {
    it("writes an expense when principal becomes profit paid", () => {
        const plan = planLoanMirror(pay(5_000), nothing);
        assert.equal(plan.expense, "create");
        assert.equal(plan.other_income, "none");
        assert.equal(plan.amount, 5_000);
    });

    it("writes an other-income when principal becomes profit received", () => {
        const plan = planLoanMirror(receive(5_000), nothing);
        assert.equal(plan.expense, "none");
        assert.equal(plan.other_income, "create");
    });

    it("removes the expense when a profit payment is corrected to principal", () => {
        const plan = planLoanMirror(pay(5_000, "principal"), hasExpense);
        assert.equal(plan.expense, "delete");
        assert.equal(plan.other_income, "none");
    });

    it("removes the other-income when a profit receipt is corrected to principal", () => {
        const plan = planLoanMirror(receive(5_000, "principal"), hasIncome);
        assert.equal(plan.expense, "none");
        assert.equal(plan.other_income, "delete");
    });

    it("swaps both sides when a profit PAYMENT is corrected to a RECEIPT", () => {
        // The case a hand-written reconcile gets wrong: it is two operations,
        // not one, and doing only half of it leaves the money in the P&L twice
        // or not at all.
        const plan = planLoanMirror(receive(5_000), hasExpense);
        assert.equal(plan.expense, "delete");
        assert.equal(plan.other_income, "create");
    });

    it("swaps both sides the other way round too", () => {
        const plan = planLoanMirror(pay(5_000), hasIncome);
        assert.equal(plan.expense, "create");
        assert.equal(plan.other_income, "delete");
    });

    it("updates in place when only the amount changed", () => {
        const plan = planLoanMirror(pay(7_500), hasExpense);
        assert.equal(plan.expense, "update");
        assert.equal(plan.amount, 7_500);
    });

    it("removes the twin when a profit row is edited down to Tk 0", () => {
        const plan = planLoanMirror({ payment_category: "profit", received_amount: 0, payment_amount: 0 }, hasExpense);
        assert.equal(plan.expense, "delete");
        assert.equal(plan.other_income, "none");
    });

    it("does nothing at all to a principal row that never had a twin", () => {
        const plan = planLoanMirror(pay(4_000, "principal"), nothing);
        assert.equal(plan.expense, "none");
        assert.equal(plan.other_income, "none");
        assert.equal(plan.kind, null);
    });

    it("never plans to keep both twins - the double count, as an assertion", () => {
        const rows = [
            pay(5_000), receive(5_000), pay(5_000, "principal"), receive(5_000, "principal"),
            { payment_category: "profit", received_amount: 0, payment_amount: 0 },
            { received_amount: 0, payment_amount: 700 },
        ];
        const linkSets = [nothing, hasExpense, hasIncome, { expense_id: "exp-1", other_income_id: "inc-1" }];

        for (const row of rows) {
            for (const links of linkSets) {
                const plan = planLoanMirror(row, links);
                const alive = (action: string) => action === "create" || action === "update";
                assert.equal(
                    alive(plan.expense) && alive(plan.other_income), false,
                    "two twins planned for " + JSON.stringify(row) + " with " + JSON.stringify(links)
                );
            }
        }
    });
});

describe("needsExpenseCategory", () => {
    it("is true only for profit that was PAID", () => {
        assert.equal(needsExpenseCategory(pay(5_000)), true);
        assert.equal(needsExpenseCategory(receive(5_000)), false);
        assert.equal(needsExpenseCategory(pay(5_000, "principal")), false);
        assert.equal(needsExpenseCategory(receive(5_000, "principal")), false);
    });

    it("is false for a profit row of Tk 0, which writes no expense to categorise", () => {
        assert.equal(needsExpenseCategory({ payment_category: "profit", received_amount: 0, payment_amount: 0 }), false);
    });
});

describe("needsIncomeSource", () => {
    it("is true only for profit that was RECEIVED", () => {
        assert.equal(needsIncomeSource(receive(5_000)), true);
        assert.equal(needsIncomeSource(pay(5_000)), false);
        assert.equal(needsIncomeSource(receive(5_000, "principal")), false);
        assert.equal(needsIncomeSource(pay(5_000, "principal")), false);
    });

    it("never agrees with needsExpenseCategory - a row has one side or neither", () => {
        for (const row of [receive(5_000), pay(5_000), receive(5_000, "principal"), pay(4_000, "principal")]) {
            assert.equal(needsIncomeSource(row) && needsExpenseCategory(row), false);
        }
    });
});
