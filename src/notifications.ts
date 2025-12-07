// Telegram Notifications

import type { ArbOpportunity } from './types.ts';

/**
 * Send arbitrage opportunity alert to Telegram
 */
export async function sendTelegramAlert(
  botToken: string,
  chatId: string,
  arb: ArbOpportunity,
  autoLayStatus: string,
): Promise<boolean> {
  const profitPct = (arb.profitMargin * 100).toFixed(2);

  // Build the Message Text (HTML)
  const startTime = new Date(arb.startTime).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const text = `
🚨 <b>ARB FOUND: ${profitPct}%</b>

Strategy: Back <b>$${arb.suggestedStake}</b> on ${arb.bookie} @ ${arb.bookieOdds}
Betfair Status: ${autoLayStatus}

🏆 <b>${arb.event}</b>
📅 ${startTime}
`;

  // Build the Buttons (Inline Keyboard)
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: `📲 OPEN ${arb.bookie.toUpperCase()}`,
          url: arb.bookieUrl, // Deep Link
        },
      ],
      [
        {
          text: '🔄 OPEN BETFAIR',
          url: `https://www.betfair.com.au/exchange/plus/market/${arb.betfairMarketId}`,
        },
      ],
    ],
  };

  // Send Request
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Telegram Error:', errorText);
      return false;
    }

    console.log(`✅ Telegram Alert sent for ${arb.id}`);
    return true;
  } catch (error) {
    console.error('Failed to send Telegram alert:', error);
    return false;
  }
}
