# Arb-Seeker

A low-latency Sports Arbitrage Bot that detects price discrepancies between Australian Bookmakers and Betfair, built with Deno and TypeScript.

## Overview

Arb-Seeker uses a **Hybrid Automation** strategy:
- **Bookies:** "Click-to-Bet" alerts via Telegram (to avoid bans)
- **Betfair:** Manual Mode - calculates arbs and alerts, waits for manual lay placement (Auto-Lay will be enabled when fully tested)

## System Architecture

- **Runtime:** Deno (TypeScript)
- **State:** Deno KV (Deduplication & Session Management)
- **Notifications:** Telegram Bot API with Inline Keyboards
- **Operating Hours:** Sydney daytime only (7am-11pm AEST/AEDT)
- **External APIs:**
  - **Odds Provider:** The-Odds-API (polls during daytime hours only)
  - **Betfair Exchange:** API-NG (JSON-RPC) for execution (manual mode - no automatic bets)

## Features

- **Daytime-Only Operation:** Bot only runs during Sydney daytime (7am-11pm) to align with manual confirmation workflow
- **Smart Polling:** Tiered intervals to optimize API usage and costs (polls The-Odds-API during daytime only)
- **Active Hours Filtering:** Skips sports outside their active time windows
- **Grey Man Strategy:** Random stake amounts that avoid round numbers (bot detection)
- **Automated Deduplication:** Prevents processing the same arb twice (2-hour expiry)
- **Profit Margin Validation:** Only processes arbs with ≥2% profit margin
- **Betfair Cross-Referencing:** Automatically searches and matches Betfair markets with bookie odds
- **Liquidity Checking:** Ensures sufficient Betfair liquidity (≥$20) before processing
- **Manual Mode:** Calculates arbitrage opportunities and alerts via Telegram (manual lay placement required)
- **Telegram Alerts:** Instant notifications with deep links to bookie apps and Betfair markets

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

### Run system diagnostics:
```bash
deno task diagnose
```

The diagnostic script performs a comprehensive System Integrity Test (SIT) that verifies:
- ✅ Environment variables and configuration
- ✅ Telegram bot connectivity
- ✅ Odds API access and quota status
- ✅ Betfair authentication and session generation
- ✅ Arbitrage calculation logic

All tests must pass before deployment. The script will exit with code 0 if all tests pass, or code 1 if any test fails.

## Daytime-Only Operation

The bot operates only during **Sydney daytime hours (7am-11pm AEST/AEDT)** to align with manual confirmation workflow:

- **Active Hours:** 7:00 AM - 11:00 PM Sydney time
- **Automatic Shutdown:** Bot stops at 11pm and logs "Reached end of daytime - bot stopped"
- **Automatic Resume:** Bot resumes at 7am and logs "Good morning - resuming bot"
- **Timezone Handling:** Automatically accounts for AEST/AEDT daylight saving transitions

This ensures the bot is only active when you're available to manually confirm and place bets.

## Smart Polling Strategy

Arb-Seeker polls The-Odds-API during Sydney daytime hours (7am-11pm) using tiered polling intervals:

### Tier 1 Sports (High Volatility)
- **Sports:** NBA, AFL, NRL, Soccer EPL, Soccer UEFA Champions League
- **Interval:** Every 2 minutes (during daytime only)
- **Daily Requests:** ~2,400 requests/day (5 sports × 30 scans/hour × 16 hours daytime, adjusted for active hours filtering)

### Tier 2 Sports (Lower Volatility)
- **Sports:** Cricket, Rugby Union
- **Interval:** Every 10 minutes (during daytime only)
- **Daily Requests:** ~192 requests/day (2 sports × 6 scans/hour × 16 hours daytime)

### Tier 3 Sports (Static)
- **Sports:** Futures/Outrights
- **Interval:** Every 6 hours (during daytime only)
- **Daily Requests:** Minimal

**Total Monthly Usage (Daytime Only):** ~77,000 requests/month (with active hours filtering, leaving ~23,000 buffer)

### Active Hours Filtering

Sports are only scanned during their typical active hours (AEDT timezone):
- **NBA:** 8 AM - 2 PM
- **AFL:** 12 PM - 10 PM
- **NRL:** 4 PM - 10 PM
- **Cricket:** 10 AM - 8 PM
- **Rugby Union:** 6 PM - 11 PM
- **Soccer EPL:** 8 PM - 8 AM (UK timezone overlap)
- **Soccer UEFA Champions League:** 4 AM - 10 AM (European matches)

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

1. **Market Match:** Betfair market found for the game
2. **Profit Margin:** ≥ 2% (calculated as: `(1 / impliedProbability) - 1`)
3. **Liquidity:** Betfair lay liquidity ≥ $20
4. **Deduplication:** Not already processed in the last 2 hours
5. **Time Window:** Game starts within 24 hours (for better liquidity)

### Processing Flow

1. Check if within Sydney daytime (7am-11pm) - skip if outside hours
2. Fetch odds from The-Odds-API for active sports (during daytime only)
3. For each game found:
   - Skip games starting >24h away (low liquidity)
   - Search Betfair for matching market using team names
   - Compare bookie back odds vs Betfair lay odds
   - Detect arbitrage opportunities using `detectArb()`
4. For each valid arb:
   - Calculate Grey Man stake
   - Validate via ArbEngine
   - Calculate Betfair liability
   - Send Telegram notification with "Manual Lay Required" status
   - Wait for manual lay placement via Betfair button

**Note:** In mock mode (`MOCK_MODE=true`), the bot uses mock data instead of polling The-Odds-API and Betfair.

## Betfair Integration

### Authentication

- Uses Interactive Login (V1) - simpler than certificate-based auth
- Session tokens stored in Deno KV with 24-hour expiry
- Auto-refreshes on `INVALID_SESSION` errors

### Market Search & Cross-Referencing

The bot automatically cross-references bookie odds with Betfair markets:

- **Market Matching:** Searches Betfair for matching markets using team names and event type
- **Sport Mapping:** Maps sport keys to Betfair event type IDs:
  - `basketball_nba` → `7522`
  - `aussierules_afl` → `61420`
  - `rugbyleague_nrl` → `1477`
  - `cricket` → `4`
  - `rugbyunion` → `5`
  - `soccer_epl` → `1`
  - `soccer_uefa_champs_league` → `1`
- **Price Comparison:** Compares bookie back odds against Betfair lay odds in real-time
- **Liquidity Check:** Ensures sufficient Betfair liquidity (≥$20) before processing opportunities
- **Arbitrage Detection:** Calculates implied probability and profit margin (requires ≥2% profit)

### Lay Betting (Manual Mode)

- **Current Status:** Manual Mode - Auto-lay is disabled
- Bot calculates lay stake and liability for each arb
- Telegram notifications include "⚠️ Manual Lay Required" status
- User manually places lay bets via Betfair button in Telegram
- Auto-lay functionality will be enabled when the approach is fully tested

**Note:** The `BetfairService.placeLayBet()` method exists but is currently commented out in `main.ts` to prevent automatic execution.

## Telegram Notifications

Notifications include:
- **Header:** Profit percentage (bold)
- **Strategy:** Stake amount, bookie, and odds
- **Betfair Status:** "⚠️ Manual Lay Required" (indicates manual intervention needed)
- **Event Details:** Sport, teams, start time
- **Buttons:**
  - **OPEN [BOOKIE] APP:** Deep link to bookie app (place back bet manually)
  - **OPEN BETFAIR:** Universal link to Betfair market (place lay bet manually)

**Workflow:** When you receive a notification:
1. Click the bookie button to place your back bet (e.g., $30, $50, or any amount you choose)
2. Click the Betfair button to open the market
3. Manually enter the lay stake (calculated as roughly 10% of the bot's suggested stake) and place the bet

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
- `soccer_epl` - English Premier League
- `soccer_uefa_champs_league` - UEFA Champions League

### Tennis (Currently Disabled)

Tennis is currently commented out in the configuration. The-Odds-API does not support generic keys like `tennis_atp` or `tennis_wta`. Instead, they use **tournament-specific keys** (e.g., `tennis_atp_aus_open_singles`, `tennis_atp_wimbledon`, `tennis_wta_wimbledon`).

During the off-season (typically November-December), these tournament-specific keys are not available. To enable tennis arbitrage detection:
1. Wait for active tournaments (typically late December/January for Australian Open)
2. Add tournament-specific keys to `SPORT_KEYS` in `src/config.ts`
3. Configure corresponding entries in `SPORT_TIERS`, `ACTIVE_HOURS`, and `getBetfairIdFromKey()`

## Error Handling

- **Daytime Transitions:** Bot automatically logs when stopping (11pm) and resuming (7am)
- **404 Errors:** Invalid sport keys are logged and skipped (no crash)
- **API Failures:** Individual arb failures don't stop the scanning process
- **Betfair Integration:** Manual mode ensures no automatic bets are placed
- **Minimal Logging:** Only I/O operations are logged (as per preferences)

## Testing

### System Diagnostics

Run the diagnostic script to verify all system components are working correctly:

```bash
deno task diagnose
```

**What it tests:**
1. **Configuration Check** - Verifies all required environment variables are present and loaded
2. **Telegram Bot Connection** - Tests connectivity and identifies the bot username
3. **Odds API Access** - Checks API reachability and displays remaining request quota
4. **Betfair Session Generation** - Validates authentication and session token generation
5. **Math Engine** - Verifies arbitrage calculation logic with test scenarios

**Expected Output:**
- All tests should show `✅ PASS`
- System status: `🚀 SYSTEM HEALTHY - READY FOR DEPLOYMENT`
- Exit code: `0` (success)

**Common Issues:**
- **Betfair Auth Failure:** Usually indicates wrong password type (API password vs website password) or missing credentials
- **Odds API Quota:** Check that remaining requests shows a number (not null) - indicates active API key
- **Telegram Bot:** Verify bot token is correct and bot is active

### Mock Mode

Set `MOCK_MODE=true` to test without real API calls:
- Generates a perfect arb (Sportsbet 2.50 / Betfair 2.30)
- Uses mock Betfair responses
- Sends real Telegram notifications (for testing)

### Verification Checklist

When testing, verify:
- ✅ Telegram receives a message
- ✅ Message shows bold stake amount (e.g., "Bet **$315**")
- ✅ Betfair status shows "⚠️ Manual Lay Required"
- ✅ Buttons are clickable and open correct apps/links
- ✅ Deduplication prevents duplicate processing
- ✅ No automatic bets are placed (manual mode confirmed)

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

