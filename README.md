# Rail Sheba Personal Assistant

A local, single-account browser assistant for Bangladesh Railway's official e-ticket website.

It prepares a journey, performs **one** scheduled search, ranks available seats, and can select them in this order:

1. A configured table-seat group.
2. Configured preferred seat numbers.
3. The requested number of adjacent seats.
4. The largest adjacent group plus other available seats.
5. Any available seats.

The assistant deliberately stops before reservation confirmation, CAPTCHA and payment. It does not call undocumented APIs, solve CAPTCHAs, rotate IP addresses, create accounts, or retry aggressively.

## Setup

1. Install Node.js 20 or newer and Google Chrome or Microsoft Edge.
2. Run `npm install`.
3. Run `npx playwright install chromium` if Playwright reports that its browser support is missing. The assistant normally uses an installed Chrome or Edge browser.
4. Copy `config.example.json` to `config.json`.
5. Edit the journey and release time in `config.json`. Keep the `+06:00` timezone for Bangladesh time.
6. Run `npm run setup-session` and sign in manually. The session remains in `.rail-profile` on this computer.

Do not put a password, OTP, card number or NID in `config.json`.

## Configure seats

`passengerCount` must be from 1 to 4. Examples:

```json
"seatPreferences": {
  "preferredSeatNumbers": ["A1", "A2", "A3", "A4"],
  "tableSeatGroups": [
    ["A1", "A2", "B1", "B2"],
    ["C1", "C2", "D1", "D2"]
  ],
  "allowPartial": false
}
```

Table layouts and seat labels vary by train and coach. Add groups that match the labels displayed by the official seat map.

## First run

Keep `execution.dryRun` set to `true` and run:

```powershell
npm run dry-run
```

The assistant will calculate and print its chosen seats without clicking them. After verifying the result, change `dryRun` to `false` and run `npm start`.

If the post-login seat map does not match the example selectors:

```powershell
npm run inspect-seats
```

Navigate to a seat map manually and press Enter. The command writes non-sensitive element metadata to `artifacts/seat-map-elements.json`. Use that file to update `selectors.seat` in `config.json`.

## Limits

- One account and one search attempt per run.
- Maximum four requested seats.
- No automated password entry, CAPTCHA solving, reservation confirmation or payment.
- No guarantee of availability; the Railway server is authoritative.
- The website can change at any time, requiring selector calibration.

## Cloudflare verification

The browser is launched with Chromium's security sandbox enabled. If the login page still shows **Verification failed**, stop the assistant and use the official site in a normal browser. Do not repeatedly retry the challenge. This project does not hide automation, bypass Cloudflare, or solve its verification challenge.
