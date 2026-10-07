import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSalaryTwin, salaryExpenseAmount, salaryExpenseData, salaryExpenseMarker, salaryExpenseNotes } from "./salaryExpense.js";

// The website writes this row from EmployeeTransactions.createOrUpdateExpense
// and finds it again by the marker in its notes, so the notes here must be the
// ones it writes, character for character.

const salary = {
    id: "txn-1",
    employee_name: "Rahim",
    payment_type: "Salary",
    date: "2026-10-07",
    period_from: "2026-10-01",
    period_to: "2026-10-31",
    amount: 15000,
    bonus: 0,
    notes: "October",
    category_id: "cat-1",
    account_id: "acc-1",
};

describe("salaryExpenseNotes", () => {
    it("writes the website's lines: marker, payment, period, notes", () => {
        assert.equal(
            salaryExpenseNotes(salary),
            "SalaryTransaction:txn-1\nSalary payment for Rahim\nPeriod: 2026-10-01 to 2026-10-31\nOctober"
        );
    });

    it("leaves out a missing period and empty notes", () => {
        assert.equal(
            salaryExpenseNotes({ ...salary, payment_type: "Bonus", period_to: null, notes: "" }),
            "SalaryTransaction:txn-1\nBonus payment for Rahim"
        );
    });
});

describe("salaryExpenseAmount", () => {
    it("is the salary or the bonus, whichever was paid", () => {
        assert.equal(salaryExpenseAmount({ amount: 15000, bonus: 0 }), 15000);
        assert.equal(salaryExpenseAmount({ amount: 0, bonus: 2500 }), 2500);
        assert.equal(salaryExpenseAmount({ amount: "1200.50", bonus: null }), 1200.5);
    });
});

describe("salaryExpenseData", () => {
    const names = { category_name: "Salary", account_name: "Cash" };

    it("books the payment against its account and category", () => {
        assert.deepEqual(salaryExpenseData(salary, names), {
            date: "2026-10-07",
            category_id: "cat-1",
            category_name: "Salary",
            amount: 15000,
            account_id: "acc-1",
            account_name: "Cash",
            notes: "SalaryTransaction:txn-1\nSalary payment for Rahim\nPeriod: 2026-10-01 to 2026-10-31\nOctober",
        });
    });

    it("books nothing without a category, an account or an amount", () => {
        assert.equal(salaryExpenseData({ ...salary, category_id: null }, names), null);
        assert.equal(salaryExpenseData({ ...salary, account_id: "" }, names), null);
        assert.equal(salaryExpenseData({ ...salary, amount: 0, bonus: 0 }, names), null);
    });
});

describe("isSalaryTwin", () => {
    it("knows its own twin by the marker and nothing else", () => {
        assert.equal(isSalaryTwin(`${salaryExpenseMarker("txn-1")}\nSalary payment for Rahim`, "txn-1"), true);
        assert.equal(isSalaryTwin("Office rent", "txn-1"), false);
        assert.equal(isSalaryTwin(null, "txn-1"), false);
    });
});
