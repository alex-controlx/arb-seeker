// Arbitrage Engine - Deduplication and validation

import type { ArbOpportunity } from './types.ts';
import { calculateProfitMargin } from './utils.ts';

const MIN_PROFIT_MARGIN = 0.02; // 2%
const KV_EXPIRY_SECONDS = 2 * 60 * 60; // 2 hours

export class ArbEngine {
  private kv: Deno.Kv;

  constructor(kv: Deno.Kv) {
    this.kv = kv;
  }

  /**
   * Check if an arb opportunity has already been processed
   */
  async isProcessed(id: string): Promise<boolean> {
    const result = await this.kv.get(['processed', id]);
    return result.value !== null;
  }

  /**
   * Mark an arb opportunity as processed
   */
  async markProcessed(arb: ArbOpportunity): Promise<void> {
    await this.kv.set(['processed', arb.id], {
      timestamp: new Date().toISOString(),
      arbId: arb.id,
    }, {
      expireIn: KV_EXPIRY_SECONDS * 1000,
    });
  }

  /**
   * Validate an arb opportunity against business rules
   */
  validateArb(arb: ArbOpportunity): { valid: boolean; reason?: string } {
    // Check profit margin
    if (arb.profitMargin < MIN_PROFIT_MARGIN) {
      return {
        valid: false,
        reason: `Profit margin ${(arb.profitMargin * 100).toFixed(2)}% is below minimum ${(MIN_PROFIT_MARGIN * 100).toFixed(2)}%`,
      };
    }

    // Check liquidity - need enough to cover the full back bet
    const requiredLiquidity = arb.suggestedStake * arb.bookieOdds;
    if (arb.layLiquidity < requiredLiquidity) {
      return {
        valid: false,
        reason: `Insufficient liquidity: need $${requiredLiquidity.toFixed(2)}, have $${arb.layLiquidity.toFixed(2)}`,
      };
    }

    return { valid: true };
  }

  /**
   * Process an arb opportunity - check if already processed, validate, and mark as processed
   */
  async processArb(arb: ArbOpportunity): Promise<{ processed: boolean; reason?: string }> {
    // Check if already processed
    if (await this.isProcessed(arb.id)) {
      return {
        processed: false,
        reason: 'Already processed',
      };
    }

    // Validate
    const validation = this.validateArb(arb);
    if (!validation.valid) {
      return {
        processed: false,
        reason: validation.reason,
      };
    }

    // Mark as processed
    await this.markProcessed(arb);

    return { processed: true };
  }
}

