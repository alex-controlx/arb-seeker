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

