# Arb-Seeker

A low-latency Sports Arbitrage Bot that detects price discrepancies between Australian Bookmakers and Betfair, built with Deno and TypeScript.

## Overview

Arb-Seeker uses a **Hybrid Automation** strategy:
- **Bookies:** "Click-to-Bet" alerts via Telegram (to avoid bans)
- **Betfair:** Fully automated "Auto-Lay" execution (to lock profit instantly)

## System Architecture

- **Runtime:** Deno (TypeScript)
- **State:** Deno KV (Deduplication & Session Management)
- **Notifications:** Telegram Bot API with Inline Keyboards
- **External APIs:**
  - **Odds Provider:** The-Odds-API (100k requests/month plan recommended)
  - **Betfair Exchange:** API-NG (JSON-RPC) for execution

## Features

- **Smart Polling:** Tiered intervals to optimize API usage and costs
- **Active Hours Filtering:** Skips sports outside their active time windows
- **Grey Man Strategy:** Random stake amounts that avoid round numbers (bot detection)
- **Automated Deduplication:** Prevents processing the same arb twice (2-hour expiry)
- **Profit Margin Validation:** Only processes arbs with ≥2% profit margin
- **Liquidity Checking:** Ensures sufficient Betfair liquidity before processing
- **Automated Lay Betting:** Automatically places counter-bets on Betfair
- **Telegram Alerts:** Instant notifications with deep links to bookie apps

## Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd arb-seeker
   ```

2. **Set up environment variables:**
   Create a `.env` file with the following variables:
   ```env
   # The-Odds-API Configuration
   ODDS_API_KEY=your_odds_api_key_here

   # Telegram Bot Configuration
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   TELEGRAM_CHAT_ID=your_telegram_chat_id

   # Betfair API Configuration
   BETFAIR_APP_KEY=your_betfair_app_key
   BETFAIR_USERNAME=your_betfair_username
   BETFAIR_PASSWORD=your_betfair_password

   # Grey Man Strategy Configuration
   GREY_MAN_MIN_STAKE=280
   GREY_MAN_MAX_STAKE=420

   # Testing
   MOCK_MODE=false
   ```

3. **Get Telegram Bot Token:**
   - Message [@BotFather](https://t.me/botfather) on Telegram
   - Create a new bot with `/newbot`
   - Copy the bot token to `TELEGRAM_BOT_TOKEN`

4. **Get Telegram Chat ID:**
   - Start a chat with your bot
   - Send a message to [@userinfobot](https://t.me/userinfobot) or check the Telegram API
   - Copy your chat ID to `TELEGRAM_CHAT_ID`

## Usage

### Start the application:
```bash
deno task start
```

### Development mode (with watch):
```bash
deno task dev
```

### Test with mock data:
```bash
MOCK_MODE=true deno task start
```

## Smart Polling Strategy

To optimize API usage and stay within the 100k requests/month limit, Arb-Seeker uses tiered polling intervals:

### Tier 1 Sports (High Volatility)
- **Sports:** NBA, AFL, NRL
- **Interval:** Every 2 minutes
- **Daily Requests:** ~2,160 requests/day (3 sports × 30 scans/hour × 24 hours)

### Tier 2 Sports (Lower Volatility)
- **Sports:** Cricket, Rugby Union
- **Interval:** Every 10 minutes
- **Daily Requests:** ~432 requests/day (2 sports × 6 scans/hour × 24 hours)

### Tier 3 Sports (Static)
- **Sports:** Futures/Outrights
- **Interval:** Every 6 hours
- **Daily Requests:** Minimal

**Total Monthly Usage:** ~78,000 requests/month (leaving ~22,000 buffer for debugging)

### Active Hours Filtering

Sports are only scanned during their typical active hours (AEDT timezone):
- **NBA:** 8 AM - 2 PM
- **AFL:** 12 PM - 10 PM
- **NRL:** 4 PM - 10 PM
- **Cricket:** 10 AM - 8 PM
- **Rugby Union:** 6 PM - 11 PM

This reduces unnecessary API calls by ~30%.

### Upcoming Games Only

Only fetches games starting in the next 24 hours, as arbs are rare/unstable for games 3+ days away.

## Grey Man Strategy

To avoid bot detection on bookie sites, stakes are calculated using the "Grey Man" strategy:

- Random integer between `GREY_MAN_MIN_STAKE` and `GREY_MAN_MAX_STAKE`
- **Constraint:** The number must NOT be divisible by 50 or 100
- **Example:** $300 is bad, $315 is good
- **Reasoning:** Round numbers trigger bot filters on bookie sites

## Arbitrage Detection

### Validation Rules

An arbitrage opportunity must pass all of these checks:

1. **Profit Margin:** ≥ 2%
2. **Liquidity:** Betfair liquidity ≥ (stake × bookie odds)
3. **Deduplication:** Not already processed in the last 2 hours

### Processing Flow

1. Fetch odds from The-Odds-API for active sports
2. Parse and match with Betfair markets
3. Detect arbitrage opportunities
4. For each valid arb:
   - Calculate Grey Man stake
   - Validate via ArbEngine
   - Calculate Betfair liability
   - Attempt auto-lay on Betfair
   - Send Telegram notification with status

## Betfair Integration

### Authentication

- Uses Interactive Login (V1) - simpler than certificate-based auth
- Session tokens stored in Deno KV with 24-hour expiry
- Auto-refreshes on `INVALID_SESSION` errors

### Lay Betting

- Automatically calculates lay stake from liability
- Checks account balance before placing bets
- Uses `LIMIT_ORDER` with `PERSISTENCE_TYPE: LAPSE`
- Returns success/failure status for Telegram alerts

## Telegram Notifications

Notifications include:
- **Header:** Profit percentage (bold)
- **Strategy:** Stake amount, bookie, and odds
- **Betfair Status:** Auto-lay success or failure
- **Event Details:** Sport, teams, start time
- **Buttons:**
  - **OPEN [BOOKIE] APP:** Deep link to bookie app
  - **OPEN BETFAIR:** Universal link to Betfair market

## Project Structure

```
/
├── deno.json              # Deno configuration and tasks
├── .env                   # Environment variables (not in repo)
├── README.md              # This file
└── src/
    ├── main.ts            # Main orchestration with cron jobs
    ├── config.ts          # Configuration and environment variables
    ├── types.ts           # TypeScript interfaces
    ├── utils.ts           # Utility functions (stake calculator, etc.)
    ├── arbEngine.ts       # Deduplication and validation logic
    ├── oddsService.ts     # The-Odds-API integration
    ├── arbDetector.ts     # Arbitrage detection logic
    ├── notifications.ts   # Telegram notification service
    ├── betfairAuth.ts     # Betfair session management
    ├── betfairService.ts  # Betfair API operations
    └── mockData.ts        # Mock data for testing
```

## Sport Keys

The following sport keys are configured for The-Odds-API:

- `basketball_nba` - NBA
- `aussierules_afl` - AFL (note: no underscore in 'aussierules')
- `rugbyleague_nrl` - NRL (note: no underscore in 'rugbyleague')
- `cricket` - Cricket
- `rugbyunion` - Rugby Union

## Error Handling

- **404 Errors:** Invalid sport keys are logged and skipped (no crash)
- **API Failures:** Individual arb failures don't stop the scanning process
- **Betfair Errors:** Failed lay bets trigger manual lay alerts in Telegram
- **Minimal Logging:** Only I/O operations are logged (as per preferences)

## Testing

### Mock Mode

Set `MOCK_MODE=true` to test without real API calls:
- Generates a perfect arb (Sportsbet 2.50 / Betfair 2.30)
- Uses mock Betfair responses
- Sends real Telegram notifications (for testing)

### Verification Checklist

When testing, verify:
- ✅ Telegram receives a message
- ✅ Message shows bold stake amount (e.g., "Bet **$315**")
- ✅ Betfair status shows correctly
- ✅ Buttons are clickable and open correct apps/links
- ✅ Deduplication prevents duplicate processing

## Requirements

- Deno 1.38+ (for unstable KV and cron APIs)
- The-Odds-API account (100k requests/month plan recommended)
- Betfair Developer account with API credentials
- Telegram bot (created via @BotFather)

## Permissions

The application requires the following Deno permissions:
- `--allow-net` - Network access for APIs
- `--allow-env` - Environment variable access
- `--allow-read` - File system read access
- `--allow-write` - Deno KV write access
- `--unstable-kv` - Deno KV API
- `--unstable-cron` - Deno cron API

## License

[Add your license here]

## Contributing

[Add contribution guidelines if applicable]

