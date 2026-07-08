import "dotenv/config";
import http from "http";

// ---------------------------------------------------------------------------
// One-time Google OAuth2 refresh-token generator.
//
// Why this exists:
//   Sending Gmail through OAuth2 needs a long-lived REFRESH TOKEN, which can
//   only be obtained by a human approving a consent screen once. This script
//   runs that flow locally and prints the token to paste into .env.
//
// How to use:
//   1. In Google Cloud Console -> APIs & Services -> Credentials -> your
//      OAuth client (Web application), add this redirect URI:
//          http://localhost:5050/oauth2/callback
//   2. Run:  npm run google:token
//   3. Open the printed URL, sign in with the Gmail account that will SEND
//      the mails (GOOGLE_MAIL_USER), and approve.
//   4. Copy the printed GOOGLE_REFRESH_TOKEN into .env and restart the server.
// ---------------------------------------------------------------------------

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const PORT = 5050;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2/callback`;
// Full Gmail scope is required for SMTP-over-OAuth2 sending.
const SCOPE = "https://mail.google.com/";

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing in .env - fill them first.");
    process.exit(1);
}

// Build the consent URL the user must open in a browser.
// access_type=offline + prompt=consent guarantees a refresh_token is returned.
const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    "&response_type=code" +
    `&scope=${encodeURIComponent(SCOPE)}` +
    "&access_type=offline" +
    "&prompt=consent";

// Tiny local server that catches Google's redirect and finishes the exchange.
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);

    if (url.pathname !== "/oauth2/callback") {
        res.writeHead(404).end("Not found");
        return;
    }

    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error || !code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h2>Authorization failed: ${error || "no code returned"}</h2>`);
        console.error("Authorization failed:", error);
        server.close();
        process.exit(1);
    }

    try {
        // Exchange the one-time authorization code for tokens.
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                redirect_uri: REDIRECT_URI,
                grant_type: "authorization_code",
            }),
        });

        const tokens = (await tokenResponse.json()) as { refresh_token?: string; error_description?: string };

        if (!tokens.refresh_token) {
            throw new Error(tokens.error_description || "No refresh_token in response (try removing the app from https://myaccount.google.com/permissions and run again)");
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h2>Success! You can close this tab - the refresh token is in your terminal.</h2>");

        console.log("\n==================================================");
        console.log("SUCCESS! Paste this line into your .env:");
        console.log(`\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
        console.log("==================================================\n");
    } catch (err) {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end(`<h2>Token exchange failed - check the terminal.</h2>`);
        console.error("Token exchange failed:", err);
    } finally {
        server.close();
        process.exit(0);
    }
});

server.listen(PORT, () => {
    console.log("\n=========================================================");
    console.log("Google OAuth2 refresh token generator");
    console.log("=========================================================");
    console.log("\n1. Make sure this redirect URI is added to your OAuth client:");
    console.log(`   ${REDIRECT_URI}`);
    console.log("\n2. Open this URL in your browser and approve:");
    console.log(`\n${authUrl}\n`);
    console.log("Waiting for Google to redirect back...\n");
});
