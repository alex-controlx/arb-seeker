// Arbitrage Detection Logic

import type { ArbOpportunity } from './types.ts';
import { calculateProfitMargin, generateArbId } from './utils.ts';
import type { BetfairRunner } from './types.ts';

export interface BookieOdds {
  eventId: string;
  event: string;
  sport: string;
  startTime: string;
  bookie: string;
  bookieKey: string;
  bookieUrl: string;
  outcome: string;
  odds: number;
}

export interface BetfairOdds {
  marketId: string;
  marketName: string;
  runners: BetfairRunner[];
}

/**
 * Find matching Betfair runner for a bookie outcome
 * This is a simplified matching - in production you'd need more sophisticated matching
 */
function findMatchingRunner(
  bookieOutcome: string,
  betfairRunners: BetfairRunner[],
): BetfairRunner | null {
  const normalizedBookie = bookieOutcome.toLowerCase().trim();

  for (const runner of betfairRunners) {
    const normalizedRunner = runner.runnerName.toLowerCase().trim();

    // Exact match
    if (normalizedRunner === normalizedBookie) {
      return runner;
    }

    // Partial match (e.g., "Lakers" matches "Los Angeles Lakers")
    if (
      normalizedRunner.includes(normalizedBookie) ||
      normalizedBookie.includes(normalizedRunner)
    ) {
      return runner;
    }
  }

  return null;
}

/**
 * Detect arbitrage opportunities by comparing bookie and Betfair odds
 */
export function detectArbs(
  bookieOdds: BookieOdds[],
  betfairOdds: BetfairOdds,
): ArbOpportunity[] {
  const opportunities: ArbOpportunity[] = [];

  for (const bookie of bookieOdds) {
    const matchingRunner = findMatchingRunner(bookie.outcome, betfairOdds.runners);

    if (!matchingRunner) continue;

    // Get best lay price from Betfair
    const layPrices = matchingRunner.ex?.availableToLay || [];
    if (layPrices.length === 0) continue;

    const bestLayPrice = layPrices[0];
    const layOdds = bestLayPrice.price;
    const layLiquidity = bestLayPrice.size * layOdds; // Approximate liquidity

    // Calculate profit margin
    const profitMargin = calculateProfitMargin(bookie.odds, layOdds);

    // Only consider positive arbitrage (bookie odds > lay odds)
    if (profitMargin > 0) {
      const arbId = generateArbId(bookie.eventId, bookie.outcome);

      // Build bookie URL - The-Odds-API provides affiliate links
      // In production, you'd construct this from the bookie key and event
      const bookieUrl = `https://www.${bookie.bookieKey.toLowerCase()}.com.au/bet/${bookie.eventId}`;

      opportunities.push({
        id: arbId,
        event: bookie.event,
        sport: bookie.sport,
        startTime: bookie.startTime,
        bookie: bookie.bookie,
        bookieOdds: bookie.odds,
        bookieUrl,
        suggestedStake: 0, // Will be calculated later
        betfairMarketId: betfairOdds.marketId,
        betfairSelectionId: matchingRunner.selectionId,
        layOdds,
        layLiquidity,
        profitMargin,
      });
    }
  }

  return opportunities;
}

/**
 * Build a complete arb opportunity from bookie and Betfair data
 */
export function buildArbOpportunity(
  bookie: BookieOdds,
  betfairRunner: BetfairRunner,
  betfairMarketId: string,
  event: string,
  sport: string,
  startTime: string,
): ArbOpportunity | null {
  const layPrices = betfairRunner.ex?.availableToLay || [];
  if (layPrices.length === 0) return null;

  const bestLayPrice = layPrices[0];
  const layOdds = bestLayPrice.price;
  const layLiquidity = bestLayPrice.size * layOdds;

  const profitMargin = calculateProfitMargin(bookie.odds, layOdds);
  if (profitMargin <= 0) return null;

  const arbId = generateArbId(bookie.eventId, bookie.outcome);
  const bookieUrl = `https://www.${bookie.bookieKey.toLowerCase()}.com.au/bet/${bookie.eventId}`;

  return {
    id: arbId,
    event,
    sport,
    startTime,
    bookie: bookie.bookie,
    bookieOdds: bookie.odds,
    bookieUrl,
    suggestedStake: 0, // Will be calculated later
    betfairMarketId,
    betfairSelectionId: betfairRunner.selectionId,
    layOdds,
    layLiquidity,
    profitMargin,
  };
}

/**
 * Detect arbitrage opportunity for a single game by comparing bookie odds with Betfair lay odds
 * Takes a parsed game object (from parseOddsResponse) and a Betfair market object
 */
export function detectArb(
  game: {
    eventId: string;
    sport: string;
    sportKey: string;
    homeTeam: string;
    awayTeam: string;
    commenceTime: string;
    bookmakers: Array<{
      bookie: string;
      bookieKey: string;
      market: string;
      outcome: string;
      odds: number;
      point?: number;
    }>;
  },
  bfMarket: {
    marketId: string;
    runners: Array<{
      selectionId: number;
      runnerName: string;
      ex?: {
        availableToBack: Array<{ price: number; size: number }>;
        availableToLay: Array<{ price: number; size: number }>;
      };
    }>;
  },
): ArbOpportunity | null {
  // Find the Betfair runner for the home team
  const homeRunner = bfMarket.runners.find((r) =>
    r.runnerName.toLowerCase().includes(game.homeTeam.toLowerCase()) ||
    game.homeTeam.toLowerCase().includes(r.runnerName.toLowerCase())
  );

  if (!homeRunner || !homeRunner.ex?.availableToLay || homeRunner.ex.availableToLay.length === 0) {
    return null;
  }

  const bfLayPrice = homeRunner.ex.availableToLay[0];
  const bfLayOdds = bfLayPrice.price;
  const bfLiquidity = bfLayPrice.size;

  // Group bookmakers by bookie to find the best home team odds for each bookie
  const bookieMap = new Map<string, { bookie: string; bookieKey: string; odds: number }>();

  for (const bm of game.bookmakers) {
    // Only consider h2h market outcomes for the home team
    if (bm.market === 'h2h' && bm.outcome === game.homeTeam) {
      const existing = bookieMap.get(bm.bookie);
      if (!existing || bm.odds > existing.odds) {
        bookieMap.set(bm.bookie, {
          bookie: bm.bookie,
          bookieKey: bm.bookieKey,
          odds: bm.odds,
        });
      }
    }
  }

  // Check each bookie's back odds against Betfair lay odds
  for (const [bookieName, bookieData] of bookieMap) {
    const backPrice = bookieData.odds;

    // Calculate implied probability: (1/backPrice) + (1/layPrice)
    // If < 1.0, there's an arbitrage opportunity
    const impliedProb = (1 / backPrice) + (1 / bfLayOdds);

    // Require at least 2% profit margin (impliedProb < 0.98)
    // Also check if enough liquidity exists on Betfair (at least $20)
    if (impliedProb < 0.98 && bfLiquidity > 20) {
      // Calculate profit margin
      const margin = (1 / impliedProb) - 1;

      // Build bookie URL (fallback if not available from API)
      const bookieUrl = `https://www.${bookieData.bookieKey.toLowerCase()}.com.au/bet/${game.eventId}`;

      return {
        id: `${game.eventId}_${bookieData.bookieKey}_home`,
        event: `${game.homeTeam} vs ${game.awayTeam}`,
        sport: game.sport,
        startTime: game.commenceTime,
        bookie: bookieName,
        bookieOdds: backPrice,
        bookieUrl,
        suggestedStake: 0, // Will be calculated by processArbOpportunity
        betfairMarketId: bfMarket.marketId,
        betfairSelectionId: homeRunner.selectionId,
        layOdds: bfLayOdds,
        layLiquidity: bfLiquidity,
        profitMargin: margin,
      };
    }
  }

  return null;
}

