import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMobileClient, mobileRefreshToken, toMobileTokens } from "./mobileClient.js";

describe("isMobileClient", () => {
    it("recognises the app's header, whatever its case or padding", () => {
        assert.equal(isMobileClient({ headers: { "x-client": "mobile" } }), true);
        assert.equal(isMobileClient({ headers: { "x-client": " Mobile " } }), true);
    });

    it("treats everything else as the website", () => {
        assert.equal(isMobileClient({ headers: {} }), false);
        assert.equal(isMobileClient({ headers: { "x-client": "web" } }), false);
        assert.equal(isMobileClient({ headers: { "x-client": "" } }), false);
    });
});

describe("mobileRefreshToken", () => {
    it("reads the token from the body of a mobile request", () => {
        const req = { headers: { "x-client": "mobile" }, body: { refreshToken: "abc" } };
        assert.equal(mobileRefreshToken(req), "abc");
    });

    // The guard that keeps httpOnly meaningful: without the header the body is
    // never consulted, and with it nothing but the body is.
    it("ignores a body token when the request is not from the app", () => {
        assert.equal(mobileRefreshToken({ headers: {}, body: { refreshToken: "abc" } }), undefined);
    });

    it("gives nothing for a missing, empty or non-string token", () => {
        const headers = { "x-client": "mobile" };
        assert.equal(mobileRefreshToken({ headers }), undefined);
        assert.equal(mobileRefreshToken({ headers, body: {} }), undefined);
        assert.equal(mobileRefreshToken({ headers, body: { refreshToken: "" } }), undefined);
        assert.equal(mobileRefreshToken({ headers, body: { refreshToken: 42 } }), undefined);
    });
});

describe("toMobileTokens", () => {
    it("passes the pair through and floors the time left", () => {
        assert.deepEqual(
            toMobileTokens({ accessToken: "a", refreshToken: "r", sessionMaxAgeMs: 1500.7 }),
            { accessToken: "a", refreshToken: "r", expiresInMs: 1500 },
        );
    });

    it("never reports negative time left", () => {
        assert.equal(toMobileTokens({ accessToken: "a", refreshToken: "r", sessionMaxAgeMs: -5 }).expiresInMs, 0);
    });
});
