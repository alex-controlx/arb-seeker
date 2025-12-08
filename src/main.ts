// Main orchestration - Tiered polling and arbitrage processing

import { loadConfig, SPORT_KEYS, SPORT_TIERS, isSydneyDaytime, getBetfairIdFromKey } from './config.ts';
import { ArbEngine } from './arbEngine.ts';
import { BetfairAuth } from './betfairAuth.ts';
import { BetfairService } from './betfairService.ts';
import { fetchOdds, parseOddsResponse } from './oddsService.ts';
import { detectArb } from './arbDetector.ts';
import { calculateGreyManStake, calculateLiability } from './utils.ts';
import { sendTelegramAlert } from './notifications.ts';
import { generateMockArb } from './mockData.ts';
import type { ArbOpportunity } from './types.ts';

// Initialize KV
const kv = await Deno.openKv();

// Load configuration
const config = loadConfig();

// Initialize services
const arbEngine = new ArbEngine(kv);
const betfairAuth = new BetfairAuth(
  kv,
  config.betfairAppKey,
  config.betfairUsername,
  config.betfairPassword,
);
const betfairService = new BetfairService(betfairAuth, config.betfairAppKey);

/**
 * Check for daytime transitions and log accordingly
 */
async function checkDaytimeTransition(): Promise<void> {
  const currentDaytime = isSydneyDaytime();
  const lastStateKey = ['daytime_state'];
  
  const lastStateEntry = await kv.get<boolean>(lastStateKey);
  const lastDaytime = lastStateEntry.value ?? null;
  
  // Detect transitions
  if (lastDaytime === null) {
    // First run - initialize state
    await kv.set(lastStateKey, currentDaytime);
    if (currentDaytime) {
      console.log('Good morning - resuming bot');
    }
  } else if (lastDaytime && !currentDaytime) {
    // Transition from daytime to nighttime (11pm)
    console.log('Reached end of daytime - bot stopped');
    await kv.set(lastStateKey, currentDaytime);
  } else if (!lastDaytime && currentDaytime) {
    // Transition from nighttime to daytime (7am)
    console.log('Good morning - resuming bot');
    await kv.set(lastStateKey, currentDaytime);
  } else {
    // No transition - update state silently
    await kv.set(lastStateKey, currentDaytime);
  }
}

/**
 * Process a single arbitrage opportunity
 */
async function processArbOpportunity(arb: ArbOpportunity): Promise<void> {
  // Calculate Grey Man stake
  arb.suggestedStake = calculateGreyManStake(
    config.greyManMinStake,
    config.greyManMaxStake,
  );

  // Process through arb engine (deduplication and validation)
  const result = await arbEngine.processArb(arb);

  if (!result.processed) {
    console.log(`Skipping arb ${arb.id}: ${result.reason}`);
    return;
  }

  // Calculate Betfair liability (amount needed to cover if lay bet wins)
  // Liability = stake * (layOdds - 1)
  const _liabilityNeeded = calculateLiability(arb.suggestedStake, arb.layOdds);

  // --- MANUAL MODE: Auto-lay disabled ---
  // Auto-lay will be enabled when the approach is fully tested
  const autoLayStatus = '⚠️ Manual Lay Required';

  // --- DANGEROUS AUTOMATION (DISABLED FOR NOW) ---
  // if (config.mockMode) {
  //   autoLayStatus = '✅ Auto-Laid (Mock)';
  // } else {
  //   const layResult = await _betfairService.placeLayBet(
  //     arb.betfairMarketId,
  //     arb.betfairSelectionId,
  //     _liabilityNeeded,
  //     arb.layOdds,
  //   );
  //
  //   if (layResult.status === 'SUCCESS') {
  //     autoLayStatus = '✅ Auto-Laid';
  //   } else {
  //     autoLayStatus = `⚠️ FAILED - Manual Lay Req (${layResult.error || 'Unknown error'})`;
  //   }
  // }

  // Send Telegram notification
  const sent = await sendTelegramAlert(
    config.telegramBotToken,
    config.telegramChatId,
    arb,
    autoLayStatus,
  );
  if (sent) {
    console.log(`Arb ${arb.id} processed and notified`);
  } else {
    console.log(`Arb ${arb.id} processed but notification failed`);
  }
}

/**
 * Scan sports for arbitrage opportunities
 * Polls The-Odds-API during daytime and processes opportunities (manual mode - no auto bets)
 */
async function scanSports(sportKeys: string[]): Promise<void> {
  // Skip if outside Sydney daytime (7am-11pm)
  if (!isSydneyDaytime()) {
    return;
  }

  for (const sportKey of sportKeys) {
    try {
      if (config.mockMode) {
        // Use mock data for testing
        const mockArb = generateMockArb();
        await processArbOpportunity(mockArb);
      } else {
        // Poll The-Odds-API for real odds data
        const events = await fetchOdds(config.oddsApiKey, { sportKey });

        if (events.length === 0) {
          continue;
        }

        // Parse odds response
        const parsedOdds = parseOddsResponse(events);

        // Get the Betfair Sport ID (e.g., 'basketball_nba' -> '7522')
        const betfairEventTypeId = getBetfairIdFromKey(sportKey);
        if (!betfairEventTypeId) {
          continue;
        }

        // Iterate through each game found on Bookies
        for (const game of parsedOdds) {
          // Skip games starting >24h away (low liquidity)
          const startTime = new Date(game.commenceTime).getTime();
          if (startTime - Date.now() > 86400000) {
            continue;
          }

          // Find the matching market on Betfair
          // Search using the Home & Away team names to find the specific "Match Odds" market
          const betfairMarket = await betfairService.findMarket({
            eventTypeId: betfairEventTypeId,
            textQuery: `${game.homeTeam} ${game.awayTeam}`,
            marketTypeCode: 'MATCH_ODDS',
          });

          if (!betfairMarket) {
            continue;
          }

          // Check for arbitrage opportunities
          const opportunity = detectArb(game, betfairMarket);

          if (opportunity) {
            // Found one! Process and notify
            await processArbOpportunity(opportunity);
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning ${sportKey}:`, error);
    }
  }
}

/**
 * Tier 1 Scan - High volatility sports (every 2 minutes)
 * Only runs during Sydney daytime (7am-11pm)
 */
Deno.cron('Tier 1 Scan', '*/2 * * * *', async () => {
  await checkDaytimeTransition();
  if (!isSydneyDaytime()) {
    return;
  }
  const tier1Sports = Object.values(SPORT_KEYS).filter(
    (key) => SPORT_TIERS[key] === 'TIER_1',
  );
  await scanSports(tier1Sports);
});

/**
 * Tier 2 Scan - Lower volatility sports (every 10 minutes)
 * Only runs during Sydney daytime (7am-11pm)
 */
Deno.cron('Tier 2 Scan', '*/10 * * * *', async () => {
  await checkDaytimeTransition();
  if (!isSydneyDaytime()) {
    return;
  }
  const tier2Sports = Object.values(SPORT_KEYS).filter(
    (key) => SPORT_TIERS[key] === 'TIER_2',
  );
  await scanSports(tier2Sports);
});

/**
 * Tier 3 Scan - Futures/Outrights (every 6 hours)
 * Only runs during Sydney daytime (7am-11pm)
 */
Deno.cron('Tier 3 Scan', '0 */6 * * *', async () => {
  await checkDaytimeTransition();
  if (!isSydneyDaytime()) {
    return;
  }
  // Tier 3 sports would be added here when needed
  console.log('Tier 3 scan (Futures/Outrights) - not yet implemented');
});

// Initial scan on startup (only if Sydney daytime)
console.log('Arb-Seeker started');
await checkDaytimeTransition();
if (isSydneyDaytime() && config.mockMode) {
  console.log('Running in MOCK_MODE - using test data');
  const mockArb = generateMockArb();
  await processArbOpportunity(mockArb);
} else if (!isSydneyDaytime()) {
  console.log('Outside Sydney daytime (7am-11pm) - skipping initial scan');
}

