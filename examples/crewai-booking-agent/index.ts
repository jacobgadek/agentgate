/**
 * CrewAI Booking Agent Example
 *
 * Demonstrates a multi-agent crew that collaborates to find, evaluate,
 * and book travel accommodations using AgentGate for payments.
 *
 * Architecture:
 *   Researcher Agent → finds available listings
 *   Analyst Agent    → evaluates options and picks the best
 *   Booker Agent     → executes the booking transaction
 *
 * NOTE: This example simulates the CrewAI pattern in pure TypeScript.
 * For a real CrewAI deployment, use the Python SDK with AgentGate's
 * REST API or a TypeScript CrewAI-compatible framework.
 */

import { AgentGate } from '@agentgate/sdk';

// ── 1. Initialize AgentGate ────────────────────────────────────────

const gate = new AgentGate({ apiKey: 'test', environment: 'sandbox' });

// ── 2. Register Crew Members ───────────────────────────────────────

const researcher = await gate.identity.register({
  name: 'travel-researcher',
  capabilities: ['browse', 'search'],
  policies: { maxTransactionAmount: 0, dailySpendLimit: 0 }, // read-only agent
});

const analyst = await gate.identity.register({
  name: 'deal-analyst',
  capabilities: ['analyze'],
  policies: { maxTransactionAmount: 0, dailySpendLimit: 0 }, // read-only agent
});

const booker = await gate.identity.register({
  name: 'booking-agent',
  capabilities: ['purchase', 'booking'],
  policies: {
    maxTransactionAmount: 1000,
    dailySpendLimit: 5000,
    requireHumanApproval: { above: 1000 },
    allowedCategories: ['travel', 'accommodation', 'transport'],
  },
});

console.log('=== CrewAI Booking Agent Demo ===\n');
console.log(`Researcher: ${researcher.id}`);
console.log(`Analyst:    ${analyst.id}`);
console.log(`Booker:     ${booker.id}\n`);

// ── 3. Simulated Hotel Listings ────────────────────────────────────

interface Listing {
  id: string;
  name: string;
  pricePerNight: number;
  rating: number;
  amenities: string[];
  location: string;
}

const listings: Listing[] = [
  {
    id: 'htl_001',
    name: 'Downtown Boutique Hotel',
    pricePerNight: 189,
    rating: 4.7,
    amenities: ['wifi', 'breakfast', 'gym', 'pool'],
    location: 'City Center',
  },
  {
    id: 'htl_002',
    name: 'Airport Express Inn',
    pricePerNight: 89,
    rating: 3.8,
    amenities: ['wifi', 'shuttle'],
    location: 'Airport District',
  },
  {
    id: 'htl_003',
    name: 'Seaside Resort & Spa',
    pricePerNight: 349,
    rating: 4.9,
    amenities: ['wifi', 'breakfast', 'spa', 'pool', 'beach'],
    location: 'Waterfront',
  },
  {
    id: 'htl_004',
    name: 'Tech Hub Co-Living',
    pricePerNight: 129,
    rating: 4.3,
    amenities: ['wifi', 'coworking', 'kitchen'],
    location: 'Innovation District',
  },
];

// ── 4. Agent Tasks ─────────────────────────────────────────────────

// Task 1: Researcher finds listings within budget
async function researchTask(maxBudget: number, nights: number): Promise<Listing[]> {
  console.log(`[Researcher] Searching for hotels under $${maxBudget}/night for ${nights} nights...\n`);

  const results = listings.filter((l) => l.pricePerNight <= maxBudget);
  console.log(`[Researcher] Found ${results.length} options within budget:`);
  for (const l of results) {
    console.log(`  • ${l.name} — $${l.pricePerNight}/night (${l.rating}★) @ ${l.location}`);
  }
  console.log();
  return results;
}

// Task 2: Analyst scores and ranks options
async function analysisTask(
  options: Listing[],
  nights: number,
  preferences: string[]
): Promise<Listing> {
  console.log(`[Analyst] Evaluating ${options.length} options against preferences: ${preferences.join(', ')}...\n`);

  const scored = options.map((listing) => {
    let score = listing.rating * 20; // base: rating out of 100
    // Bonus for matching amenities
    const matchedAmenities = listing.amenities.filter((a) => preferences.includes(a));
    score += matchedAmenities.length * 10;
    // Penalize higher total cost slightly
    const totalCost = listing.pricePerNight * nights;
    score -= totalCost * 0.02;
    return { listing, score: Math.round(score * 10) / 10, matchedAmenities, totalCost };
  });

  scored.sort((a, b) => b.score - a.score);

  console.log('[Analyst] Rankings:');
  for (const [i, s] of scored.entries()) {
    console.log(
      `  ${i + 1}. ${s.listing.name} — Score: ${s.score} (matched: ${s.matchedAmenities.join(', ') || 'none'}, total: $${s.totalCost})`
    );
  }
  console.log(`\n[Analyst] Recommendation: ${scored[0].listing.name}\n`);

  return scored[0].listing;
}

// Task 3: Booker executes the booking
async function bookingTask(listing: Listing, nights: number): Promise<void> {
  const totalAmount = listing.pricePerNight * nights;
  console.log(`[Booker] Booking ${listing.name} for ${nights} nights ($${totalAmount} total)...\n`);

  const result = await gate.transact({
    agentId: booker.id,
    intent: 'purchase',
    preferredProtocol: 'auto',
    item: {
      description: `Booking: ${listing.name} (${nights} nights)`,
      amount: totalAmount,
      currency: 'USD',
      merchantUrl: `https://${listing.id}.hotels.example.com`,
      category: 'accommodation',
    },
    metadata: {
      hotelId: listing.id,
      checkIn: '2026-04-01',
      checkOut: `2026-04-0${nights + 1}`,
      nights,
    },
  });

  console.log(`[Booker] Transaction ${result.status}!`);
  console.log(`  Receipt: ${result.receipt?.transactionId}`);
  console.log(`  Amount:  $${result.receipt?.amount}`);
  console.log(`  Via:     ${result.protocol}\n`);

  // Check trust score after booking
  const trust = await gate.trust.score(booker.id);
  console.log(`[Booker] Trust score: ${trust.score}/100 (${trust.level})\n`);
}

// ── 5. Run the Crew ────────────────────────────────────────────────

const BUDGET = 200;
const NIGHTS = 3;
const PREFERENCES = ['wifi', 'breakfast', 'pool'];

console.log(`Mission: Book a ${NIGHTS}-night hotel stay under $${BUDGET}/night`);
console.log(`Preferences: ${PREFERENCES.join(', ')}\n`);
console.log('─'.repeat(50) + '\n');

const options = await researchTask(BUDGET, NIGHTS);
const recommendation = await analysisTask(options, NIGHTS, PREFERENCES);
await bookingTask(recommendation, NIGHTS);

console.log('=== Crew Mission Complete ===');
