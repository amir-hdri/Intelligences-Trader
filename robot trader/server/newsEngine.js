import Sentiment from 'sentiment';
import { createSeededRng, hashString } from './utils/deterministic.js';
const sentiment = new Sentiment();

const NEWS_SOURCES = [
  "Reuters", "Bloomberg", "Sena", "BoursePress", "Tehran Times", "Financial Tribune"
];

const HEADLINES = [
  "Central Bank of Iran injects liquidity into interbank market",
  "NIMA exchange rate stabilizes after recent volatility",
  "OPEC agrees to cut oil production by 2 million barrels",
  "Gold prices soar as global inflation fears persist",
  "Saffron exports to Europe show 20% increase Q/Q",
  "US sanctions waiver talks stall in Vienna",
  "Tehran Stock Exchange index drops 1000 points on opening",
  "New regulations for commodity warehousing announced by IME",
  "Dollar strengthens against Rial in free market",
  "Government announces subsidy reform for energy sector",
  "Heavy rainfall damages saffron crops in Khorasan",
  "China signs new trade deal for Iranian petrochemicals",
  "Inflation rate drops to 35% according to latest SCI report",
  "Market sentiment turns bearish ahead of holiday season"
];

const generateNews = (count = 5) => {
  const news = [];
  const now = Date.now();
  // Deterministic seed based on day
  const daySlot = Math.floor(now / 3600000); // hourly slot
  const baseRng = createSeededRng(`news-${daySlot}`);

  for (let i = 0; i < count; i++) {
    const rng = createSeededRng(`news-${daySlot}-${i}-${baseRng()}`);
    const headlineIdx = Math.floor(rng() * HEADLINES.length);
    const sourceIdx = Math.floor(rng() * NEWS_SOURCES.length);
    const randomHeadline = HEADLINES[headlineIdx];
    const randomSource = NEWS_SOURCES[sourceIdx];
    const timeOffset = Math.floor(rng() * 86400000);

    const analysis = sentiment.analyze(randomHeadline);
    const score = analysis.score;
    const comparative = analysis.comparative;

    let impact = 'LOW';
    if (Math.abs(comparative) > 0.5) impact = 'HIGH';
    else if (Math.abs(comparative) > 0.2) impact = 'MEDIUM';

    const entities = [];
    if (randomHeadline.includes("Iran")) entities.push({ type: 'GPE', text: 'Iran' });
    if (randomHeadline.includes("OPEC")) entities.push({ type: 'ORG', text: 'OPEC' });
    if (randomHeadline.includes("Central Bank")) entities.push({ type: 'ORG', text: 'Central Bank' });

    let adjustedComparative = comparative;
    if (entities.some(e => e.type === 'ORG') || randomHeadline.includes("Sanctions")) {
      impact = 'HIGH';
      adjustedComparative *= 1.5;
    }
    
    adjustedComparative = Math.max(-1, Math.min(1, adjustedComparative));

    const dollarBullishTerms = /sanctions|inflation|dollar strengthens|crop damage|liquidity/i;
    const dollarBearishTerms = /stabilizes|inflation rate drops|trade deal/i;
    const impactEffect = dollarBullishTerms.test(randomHeadline)
      ? 'DOLLAR_BULLISH'
      : dollarBearishTerms.test(randomHeadline)
        ? 'DOLLAR_BEARISH'
        : 'NEUTRAL';

    // Deterministic ID based on headline hash and time
    const id = `${hashString(randomHeadline + String(now - timeOffset)).toString(36).substring(0,7)}-${i}`;

    news.push({
      id,
      title: randomHeadline,
      source: randomSource,
      timestamp: now - timeOffset,
      sentimentScore: adjustedComparative,
      sentimentLabel: adjustedComparative > 0.1 ? 'POSITIVE' : adjustedComparative < -0.1 ? 'NEGATIVE' : 'NEUTRAL',
      impactEffect,
      nerTags: entities.map(entity => entity.text),
      impact,
      entities,
      analysis: { score, positiveWords: analysis.positive, negativeWords: analysis.negative }
    });
  }

  return news.sort((a, b) => b.timestamp - a.timestamp);
};

export { generateNews };
