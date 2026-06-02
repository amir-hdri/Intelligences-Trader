import Sentiment from 'sentiment';
const sentiment = new Sentiment();

// Mock News Database
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

  for (let i = 0; i < count; i++) {
    const randomHeadline = HEADLINES[Math.floor(Math.random() * HEADLINES.length)];
    const randomSource = NEWS_SOURCES[Math.floor(Math.random() * NEWS_SOURCES.length)];
    const timeOffset = Math.floor(Math.random() * 86400000); // within last 24h

    // NLP Analysis
    const analysis = sentiment.analyze(randomHeadline);
    const score = analysis.score; // Absolute score
    const comparative = analysis.comparative; // Score adjusted for length

    let impact = 'LOW';
    if (Math.abs(comparative) > 0.5) impact = 'HIGH';
    else if (Math.abs(comparative) > 0.2) impact = 'MEDIUM';

    // Override impact based on keywords (Rule-based NLP layer)
    if (randomHeadline.includes("Sanctions") || randomHeadline.includes("OPEC") || randomHeadline.includes("Central Bank")) {
      impact = 'HIGH';
    }

    news.push({
      id: Math.random().toString(36).substring(7),
      title: randomHeadline,
      source: randomSource,
      timestamp: now - timeOffset,
      sentimentScore: comparative, // Normalized -1 to 1 approx
      sentimentLabel: score > 0 ? 'POSITIVE' : score < 0 ? 'NEGATIVE' : 'NEUTRAL',
      impact,
      analysis: {
        score,
        positiveWords: analysis.positive,
        negativeWords: analysis.negative
      }
    });
  }

  // Sort by newest
  return news.sort((a, b) => b.timestamp - a.timestamp);
};

export { generateNews };
