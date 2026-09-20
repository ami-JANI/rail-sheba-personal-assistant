# Rail Sheba Personal Assistant

A local, single-account browser assistant for Bangladesh Railway's official e-ticket website. The recommended version is an unpacked Edge/Chrome extension that runs in your normal signed-in browser session. A Playwright prototype remains under `src/` for development, but Cloudflare may reject automated browsers.

It prepares a journey, performs **one** scheduled search, ranks available seats, and can select them in this order:

1. A configured table-seat group.
2. Configured preferred seat numbers.
3. The requested number of adjacent seats.
4. The largest adjacent group plus other available seats.
5. Any available seats.

The assistant deliberately stops before reservation confirmation, CAPTCHA and payment. It does not call undocumented APIs, solve CAPTCHAs, rotate IP addresses, create accounts, or retry aggressively.

## Recommended setup: normal Edge extension

1. Open Rail Sheba in your normal Edge browser and log in manually.
2. Open `edge://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this repository's `extension` folder.
5. Pin **Rail Sheba Personal Assistant** to the toolbar.
6. Open its popup, enter the journey, train, release time, and seat preferences.
7. Keep **Dry run** enabled and click **Run now** for the first test.
8. When the dry run works, disable it and click **Arm** for a future release time.

You can also search manually on Rail Sheba first and leave its train-results page open. The extension reads the From, To, journey date and class from that page's URL, skips the home-page form, and fills its Train dropdown with the trains actually shown. Choose a train from that list before using **Run now** or **Arm**. A saved train that is absent from the current results is never selected automatically.

After pulling an update, return to `edge://extensions` and click **Reload** on the unpacked extension before testing it again.

The extension submits one search and one seat-selection pass. It does not automate login, Cloudflare verification, CAPTCHA, reservation confirmation, or payment.

## Playwright prototype setup

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
The current Railway seat map uses white `btn-seat seat-available` tiles for available seats and orange `seat-booked` tiles for occupied seats; the extension ignores booked, disabled, hidden, selected and pending tiles.

## Playwright prototype first run

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

The Playwright browser is launched with Chromium's security sandbox enabled. If its login page still shows **Verification failed** or error `600010`, stop it and use the Edge extension in a normal signed-in browser. Do not repeatedly retry the challenge. This project does not hide automation, bypass Cloudflare, or solve its verification challenge.
