import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    balanceTypeOf, lenderBalances, lenderBalancesByKey,
    lenderKeyOf, principalEffect, runningStatement,
} from "./loanBalance.js";

// The sign convention is the whole thing: positive means they owe us, negative
// means we owe them. Getting it backwards tells somebody they owe money they
// are in fact owed, so it is pinned from several directions here.
//
// The other rule worth this many tests is that profit never moves the
// principal. Before this module, interest was added with the same sign as a
// repayment - so earning interest looked like the debt shrinking.

const receive = (amount: number, category = "principal") => ({
    transaction_type: "receive", payment_category: category,
    received_amount: amount, payment_amount: 0,
});

const pay = (amount: number, category = "principal") => ({
    transaction_type: "payment", payment_category: category,
    received_amount: 0, payment_amount: amount,
});

describe("principalEffect", () => {
    it("takes money from a lender as going into their debt", () => {
        // We borrowed Tk 10,000, so we owe Tk 10,000: the balance falls.
        assert.equal(principalEffect(receive(10_000)), -10_000);
    });

    it("takes a repayment as climbing back toward zero", () => {
        assert.equal(principalEffect(pay(4_000)), 4_000);
    });

    it("moves the principal by NOTHING on a profit row", () => {
        assert.equal(principalEffect(receive(5_000, "profit")), 0);
        assert.equal(principalEffect(pay(5_000, "profit")), 0);
    });

    it("treats a row with no category as principal, so old rows keep behaving", () => {
        assert.equal(principalEffect({ received_amount: 0, payment_amount: 700 }), 700);
    });
});

describe("lenderBalances", () => {
    it("borrow 100,000 then pay 30,000 leaves 70,000 owed to them", () => {
        const result = lenderBalances({ opening_balance: 0 }, [receive(100_000), pay(30_000)]);

        assert.equal(result.current_principal, -70_000);
        assert.equal(result.balance_type, "PAYABLE");
    });

    it("paying interest does not shrink what is owed", () => {
        // The bug this module exists to kill: Tk 5,000 of interest on a
        // Tk 100,000 debt used to read as Tk 95,000 owed.
        const withoutProfit = lenderBalances({ opening_balance: 0 }, [receive(100_000)]);
        const withProfit = lenderBalances({ opening_balance: 0 }, [receive(100_000), pay(5_000, "profit")]);

        assert.equal(withProfit.current_principal, withoutProfit.current_principal);
        assert.equal(withProfit.current_principal, -100_000);
        assert.equal(withProfit.profit_paid, 5_000);
        assert.equal(withProfit.total_profit, -5_000);
    });

    it("counts profit taken in separately from profit handed over", () => {
        const result = lenderBalances({ opening_balance: 0 }, [
            receive(3_000, "profit"), pay(1_000, "profit"),
        ]);

        assert.equal(result.profit_received, 3_000);
        assert.equal(result.profit_paid, 1_000);
        assert.equal(result.total_profit, 2_000);
        assert.equal(result.current_principal, 0);
        assert.equal(result.balance_type, "SETTLED");
    });

    it("starts from the opening balance, whichever way it leans", () => {
        assert.equal(lenderBalances({ opening_balance: 9_910 }, []).current_principal, 9_910);
        assert.equal(lenderBalances({ opening_balance: 9_910 }, []).balance_type, "RECEIVABLE");
        assert.equal(lenderBalances({ opening_balance: -500 }, []).balance_type, "PAYABLE");
    });
});

describe("balanceTypeOf", () => {
    it("names the three states the SMS wording keys off", () => {
        assert.equal(balanceTypeOf(1), "RECEIVABLE");
        assert.equal(balanceTypeOf(-1), "PAYABLE");
        assert.equal(balanceTypeOf(0), "SETTLED");
    });
});

describe("lenderKeyOf", () => {
    it("keys a lender and its loan rows to the same bucket", () => {
        assert.equal(lenderKeyOf({ id: "uuid-1" }), lenderKeyOf({ lender_id: "uuid-1" }));
    });

    it("falls back to the name when a row carries no lender id", () => {
        assert.equal(lenderKeyOf({ lender_name: "Khaled Mahmud" }), "name:Khaled Mahmud");
        assert.equal(lenderKeyOf({ lender_id: null, lender_name: " Khaled Mahmud " }), "name:Khaled Mahmud");
    });

    it("keys a browser-fallback lender by name, since no loan can reference its id", () => {
        assert.equal(lenderKeyOf({ id: "local:123", name: "Ridoy" }), "name:Ridoy");
        assert.equal(lenderKeyOf({ id: "legacy:abc", name: "Ridoy" }), "name:Ridoy");
    });
});

describe("lenderBalancesByKey", () => {
    it("keeps one person in one bucket when some rows predate their lender id", () => {
        // The dashboard used to show this person twice, each with half the money.
        const lender = { id: "uuid-1", name: "Khaled Mahmud", opening_balance: 0 };
        const loans = [
            { ...receive(10_000), lender_id: "uuid-1", lender_name: "Khaled Mahmud" },
            { ...pay(3_000), lender_id: "uuid-1", lender_name: "Khaled Mahmud" },
        ];

        const byKey = lenderBalancesByKey([lender], loans);
        assert.equal(byKey.size, 1);
        assert.equal(byKey.get("uuid-1")?.current_principal, -7_000);
    });

    it("keeps money whose lender was deleted rather than dropping it", () => {
        const orphan = [{ ...receive(2_000), lender_id: null, lender_name: "Gone" }];
        const byKey = lenderBalancesByKey([], orphan);

        assert.equal(byKey.get("name:Gone")?.current_principal, -2_000);
    });
});

describe("runningStatement", () => {
    it("carries the opening balance and closes where the last row left it", () => {
        const statement = runningStatement(-70_000, [pay(20_000), pay(10_000)]);

        assert.equal(statement.opening_principal, -70_000);
        assert.deepEqual(statement.rows.map(row => row.running_principal), [-50_000, -40_000]);
        assert.equal(statement.closing_principal, -40_000);
        assert.equal(statement.total_paid, 30_000);
    });

    it("shows a profit row in the money columns but holds the balance still", () => {
        const statement = runningStatement(-100_000, [pay(5_000, "profit"), pay(20_000)]);

        const [profitRow, principalRow] = statement.rows;
        assert.equal(profitRow.debit, 5_000);
        assert.equal(profitRow.is_profit, true);
        // The whole rule, in one assertion.
        assert.equal(profitRow.running_principal, -100_000);
        assert.equal(principalRow.running_principal, -80_000);

        assert.equal(statement.total_paid, 25_000);
        assert.equal(statement.total_profit, -5_000);
        assert.equal(statement.closing_principal, -80_000);
    });

    it("closes exactly where the next window opens", () => {
        // What makes a statement trustworthy: run two windows back to back and
        // the second must start where the first finished.
        const first = runningStatement(0, [receive(50_000), pay(10_000)]);
        const second = runningStatement(first.closing_principal, [pay(15_000)]);

        assert.equal(first.closing_principal, -40_000);
        assert.equal(second.opening_principal, -40_000);
        assert.equal(second.closing_principal, -25_000);
    });

    it("an empty window still reports the balance it inherited", () => {
        const statement = runningStatement(-12_500, []);

        assert.equal(statement.opening_principal, -12_500);
        assert.equal(statement.closing_principal, -12_500);
        assert.equal(statement.rows.length, 0);
    });
});
