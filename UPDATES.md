# Updates to the Implementation

## Odds API Calls Optimization

You do not need to check every sport every minute. You need **Smart Polling**.

**Optimization Strategy:**

1.  **The "Active Hours" Filter:**
      * Don't scan NBA at 3:00 AM AEDT. The games are over.
      * Don't scan AFL at 4:00 AM AEDT.
      * *Saving:* Reduces generic scanning by \~30%.
2.  **The "Staggered" Loop:**
      * **Tier 1 Sports (High Vol, Fast Move):** NBA, AFL, NRL. Scan every **2 minutes**.
      * **Tier 2 Sports (Slow Move):** Cricket, Rugby Union. Scan every **10 minutes**.
      * **Tier 3 Sports (Static):** Futures/Outrights. Scan every **6 hours**.
3.  **The "Upcoming" Parameter:**
      * Only fetch games starting in the next 24 hours. (Bookies tighten odds on games 3 days away, so arbs are rare/unstable there).

**Revised Math (The 100k Plan Fit):**

  * **3 Major Sports** (every 2 mins) = $3 \times 30 \times 24 = 2,160$ req/day
  * **3 Minor Sports** (every 10 mins) = $3 \times 6 \times 24 = 432$ req/day
  * **Total:** \~2,600 req/day = **78,000 req/month.**
  * **Buffer:** You have \~22,000 requests left over for debugging or manual fetching.

### 4\. Updates to your IMPLEMENTATION\_PLAN.md

You need to hardcode this logic into your configuration so you don't accidentally receive a $500 overage bill.

**Add this to `config.ts`:**

```typescript
// OPTIMIZATION CONFIG
export const POLLING_INTERVALS = {
  TIER_1: 120000, // 2 minutes (NBA, AFL, NRL)
  TIER_2: 600000, // 10 minutes (Tennis, Cricket)
};

export const SPORT_KEYS = {
  NBA: 'basketball_nba',
  AFL: 'aussie_rules_afl',
  NRL: 'rugby_league_nrl'
};
```

**Add this logic to `main.ts` (Cron Update):**
Instead of one simple cron, use two:

```typescript
// Fast Loop (Tier 1)
Deno.cron("Tier 1 Scan", "*/2 * * * *", () => {
   scanSports([SPORT_KEYS.NBA, SPORT_KEYS.AFL]);
});

// Slow Loop (Tier 2)
Deno.cron("Tier 2 Scan", "*/10 * * * *", () => {
   scanSports([SPORT_KEYS.CRICKET]);
});
```

