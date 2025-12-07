// Main orchestration - Tiered polling and arbitrage processing

import { loadConfig, SPORT_KEYS, SPORT_TIERS } from './config.ts';
import { ArbEngine } from './arbEngine.ts';
import { BetfairAuth } from './betfairAuth.ts';
import { BetfairService } from './betfairService.ts';
import { fetchOdds, parseOddsResponse } from './oddsService.ts';
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
const _betfairService = new BetfairService(betfairAuth, config.betfairAppKey);

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
 */
async function scanSports(sportKeys: string[]): Promise<void> {
  for (const sportKey of sportKeys) {
    try {
      // Fetch odds from The-Odds-API
      const events = await fetchOdds(config.oddsApiKey, { sportKey });

      if (events.length === 0) {
        continue;
      }

      // Parse odds response
      const parsedOdds = parseOddsResponse(events);

      // TODO: In production, you would also fetch Betfair markets here
      // For now, we'll use mock data or skip if not in mock mode
      if (config.mockMode) {
        // Use mock data for testing
        const mockArb = generateMockArb();
        await processArbOpportunity(mockArb);
      } else {
        // In production, you would:
        // 1. Fetch Betfair markets for matching events
        // 2. Use detectArbs() to find opportunities
        // 3. Process each opportunity
        console.log(`Found ${parsedOdds.length} events for ${sportKey} (Betfair integration needed)`);
      }
    } catch (error) {
      console.error(`Error scanning ${sportKey}:`, error);
    }
  }
}

/**
 * Tier 1 Scan - High volatility sports (every 2 minutes)
 */
Deno.cron('Tier 1 Scan', '*/2 * * * *', async () => {
  const tier1Sports = Object.values(SPORT_KEYS).filter(
    (key) => SPORT_TIERS[key] === 'TIER_1',
  );
  await scanSports(tier1Sports);
});

/**
 * Tier 2 Scan - Lower volatility sports (every 10 minutes)
 */
Deno.cron('Tier 2 Scan', '*/10 * * * *', async () => {
  const tier2Sports = Object.values(SPORT_KEYS).filter(
    (key) => SPORT_TIERS[key] === 'TIER_2',
  );
  await scanSports(tier2Sports);
});

/**
 * Tier 3 Scan - Futures/Outrights (every 6 hours)
 */
Deno.cron('Tier 3 Scan', '0 */6 * * *', async () => {
  // Tier 3 sports would be added here when needed
  console.log('Tier 3 scan (Futures/Outrights) - not yet implemented');
});

// Initial scan on startup (optional)
console.log('Arb-Seeker started');
if (config.mockMode) {
  console.log('Running in MOCK_MODE - using test data');
  const mockArb = generateMockArb();
  await processArbOpportunity(mockArb);
}

