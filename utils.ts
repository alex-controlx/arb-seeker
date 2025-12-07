// Utility functions for stake calculation and arbitrage math

/**
 * Calculate Grey Man stake - random amount between min and max
 * that is NOT divisible by 50 or 100 (to avoid bot detection)
 */
export function calculateGreyManStake(min: number, max: number): number {
  let stake: number;
  do {
    stake = Math.floor(Math.random() * (max - min + 1)) + min;
  } while (stake % 50 === 0 || stake % 100 === 0);

  return stake;
}

/**
 * Calculate profit margin percentage
 * Formula: ((backOdds - layOdds) / layOdds) * 100
 */
export function calculateProfitMargin(backOdds: number, layOdds: number): number {
  if (layOdds <= 0) return 0;
  return (backOdds - layOdds) / layOdds;
}

/**
 * Calculate Betfair liability needed for a lay bet
 * Liability = stake * (layOdds - 1)
 */
export function calculateLiability(stake: number, layOdds: number): number {
  return stake * (layOdds - 1);
}

/**
 * Calculate lay stake from liability
 * Lay Stake = Liability / (LayOdds - 1)
 */
export function calculateLayStake(liability: number, layOdds: number): number {
  if (layOdds <= 1) throw new Error('Lay odds must be greater than 1');
  return liability / (layOdds - 1);
}

/**
 * Generate unique hash for arb opportunity
 * Format: eventId_marketType
 */
export function generateArbId(eventId: string, marketType: string): string {
  return `${eventId}_${marketType}`;
}

