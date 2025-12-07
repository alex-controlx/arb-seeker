**Project Name:** The Arb-Seeker (Deno/Hono Edition)
**Goal:** Build a low-latency Sports Arbitrage Bot that detects price discrepancies between Australian Bookmakers and Betfair.
**Strategy:** Hybrid Automation.

1.  **Bookies:** "Click-to-Bet" alerts via Google Chat (to avoid bans).
2.  **Betfair:** Fully automated "Auto-Lay" execution (to lock profit instantly).

## System Architecture

  * **Runtime:** Deno (TypeScript).
  * **Server:** Hono (Standard Web API).
  * **State:** Deno KV (Deduplication & Session Management).
  * **Notifications:** Google Chat Webhooks (Card V2).
  * **External APIs:**
      * **Odds Provider:** The-Odds-API (Recommended Plan: 100k requests/mo).
      * **Betfair Exchange:** API-NG (JSON-RPC) for execution.

-----

## Phase 1: Environment & Types

**Objective:** specific the data structures and configuration.

### 1.1 Configuration (`config.ts`)

The application must load the following Environment Variables:

  * `ODDS_API_KEY`: API Key for the odds provider.
  * `GOOGLE_CHAT_WEBHOOK`: URL for the alerts Space.
  * `BETFAIR_APP_KEY`: Application Key from Betfair Developer Portal.
  * `BETFAIR_USERNAME` & `BETFAIR_PASSWORD`: For session generation.
  * `GREY_MAN_MIN_STAKE`: Default 280.
  * `GREY_MAN_MAX_STAKE`: Default 420.

**Sport Keys Constant** (Corrected for API compatibility):

```typescript
export const SPORT_KEYS = {
  NBA: 'basketball_nba',
  AFL: 'aussierules_afl', // Note: No underscore in 'aussierules'
  NRL: 'rugbyleague_nrl'  // Note: No underscore in 'rugbyleague'
};
```

### 1.2 Data Models (`types.ts`)

Define the core `ArbOpportunity` interface:

```typescript
interface ArbOpportunity {
  id: string;               // Unique Hash (EventID + MarketType)
  event: string;            // e.g. "Lakers vs Celtics"
  sport: string;            // e.g. "Basketball"
  startTime: string;        // ISO Date

  // The "Back" Side (Bookie)
  bookie: string;           // e.g. "Sportsbet"
  bookieOdds: number;       // e.g. 2.50
  bookieUrl: string;        // Deep Link provided by Odds API
  suggestedStake: number;   // Calculated via Grey Man strategy

  // The "Lay" Side (Betfair)
  betfairMarketId: string;  // Crucial for automation (e.g., "1.2345678")
  betfairSelectionId: number; // The specific runner ID
  layOdds: number;          // e.g. 2.30
  layLiquidity: number;     // Available $ to Lay

  // Math
  profitMargin: number;     // e.g. 0.04 (4%)
}
```

-----

## Phase 2: Core Logic & "Grey Man" Strategy

**Objective:** Business logic to filter bad arbs and calculate safe stakes.

### 2.1 Stake Calculator (`utils.ts`)

Implement `calculateGreyManStake(min, max)`:

1.  Generate a random integer between `min` and `max`.
2.  **Constraint:** The number must NOT be divisible by 50 or 100 (e.g., $300 is bad, $315 is good).
3.  **Reasoning:** Round numbers trigger "Bot Filters" on bookie sites.

### 2.2 Deduplication (`arbEngine.ts`)

Implement `ArbEngine` class using `Deno.openKv()`:

1.  **Check:** Before processing, check `kv.get(["processed", arb.id])`.
2.  **Filter:** Ignore if `profitMargin < 2%`.
3.  **Filter:** Ignore if `layLiquidity < (suggestedStake * bookieOdds)`.
      * *Why:* If we can't fully hedge on Betfair, the risk is too high.
4.  **Persist:** If valid, save to KV with `expireIn: 2 hours`.

-----

## Phase 3: The "Soft" Side (Bookie Alerting)

**Objective:** Send clickable cards to Google Chat for the manual part of the bet.

### 3.1 Google Chat Integration (`notifications.ts`)

Implement `sendArbCard(arb: ArbOpportunity, autoLayStatus: string)`:

  * **Format:** Google Chat Card V2.
  * **Header:** "🚨 ARB FOUND: [Profit]%"
  * **Body:**
      * "Strategy: Back **$[Stake]** on [Bookie] @ [Odds]"
      * "Betfair Status: " + `autoLayStatus` (e.g., "✅ Auto-Laid" or "⚠️ FAILED - Manual Lay Req").
  * **Widgets:**
      * **Button 1:** "OPEN [BOOKIE] APP" (Link: `arb.bookieUrl`).
      * **Button 2:** "OPEN BETFAIR"
          * **Link Logic:** Use `https://www.betfair.com.au/exchange/plus/market/${arb.betfairMarketId}`.
          * *Note:* This Standard URL will act as a Universal Link and open the App if installed.

-----

## Phase 4: The "Hard" Side (Betfair Automation)

**Objective:** Automatically place the counter-bet on Betfair API-NG.

### 4.1 Session Management (`betfairAuth.ts`)

  * **Login Flow:** Use the "Interactive Login" Endpoint for V1 (Simpler than Certs).
  * **Endpoint:** `POST https://identitysso.betfair.com/api/login` (`username`, `password`).
  * **Storage:** Store `sessionToken` in Deno KV. Refresh if API returns "INVALID\_SESSION".

### 4.2 Market Resolution (`betfairService.ts`)

  * **Function:** `placeLayBet(marketId, selectionId, liabilityNeeded)`
  * **Logic:**
    1.  Calculate Lay Stake: `Liability / (LayOdds - 1)`.
    2.  **Check Balance:** Ensure account has funds.
    3.  **Place Order:**
          * Endpoint: `https://api.betfair.com/exchange/betting/json-rpc/v1`
          * Method: `placeOrders`
          * Params: `LIMIT_ORDER`, `LAY`, `PERSISTENCE_TYPE: LAPSE`.
  * **Safety:** If the bet fails (API error), return `status: FAILED` so the Google Chat alert tells the user to lay manually.

-----

## Phase 5: Orchestration

**Objective:** Tie it together in a loop.

### 5.1 Main Loop (`main.ts`)

Use `Deno.cron` (Interval: 2 minutes to save API costs).

1.  **Fetch:** Get odds from `The-Odds-API` for `SPORT_KEYS`.
2.  **Parse:** Convert to `ArbOpportunity` objects.
3.  **Process (ArbEngine):**
      * If Arb found:
          * Step A: Calculate "Grey Man" Stake (e.g., $340).
          * Step B: Calculate required Betfair Liability.
          * Step C: **Call `BetfairService.placeLayBet()`**.
          * Step D: Send Google Chat Alert with the result of Step C.

-----

## Phase 6: Testing Protocol

**Developer Instructions for Mock Testing:**

1.  Create `mockData.ts` that generates a "Perfect Arb" (Sportsbet 2.50 / Betfair 2.30).
2.  Run `deno task start`.
3.  **Verify:**
      * Google Chat receives a card.
      * Card says "Bet $315 on Sportsbet".
      * Card says "Betfair Status: [Mock Success]".
      * Clicking "OPEN BETFAIR" opens the Betfair App or Website to a specific market.