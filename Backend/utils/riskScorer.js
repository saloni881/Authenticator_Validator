// ── utils/riskScorer.js ───────────────────────────────────────────────────────
// Combines DB match result + AI analysis into a final verdict

export const calculateRiskScore = ({
  aiAnalysis,
  dbMatch,
  dbVerdict,    // 'verified' | 'not_found' | 'partial_match' | 'blacklisted'
  dbScore,      // 0-100 match confidence from matcher.js
  dbReasons,    // string[] from matcher.js
  extractedFields,
}) => {
  let score    = 50; // neutral start
  const reasons = [...(dbReasons || [])];
  const breakdown = {};

  // ── DB match scoring ───────────────────────────────────────────────────────
  if (dbVerdict === 'blacklisted') {
    return {
      finalScore: 100,
      verdict:    'Fake',
      reasons:    ['⛔ Certificate is blacklisted in official database', ...(dbReasons || [])],
      breakdown:  { db: 100, ai: 0, fields: 0 },
    };
  }

  if (dbVerdict === 'verified') {
    // Found in official DB — strong signal
    score -= 40;
    breakdown.db = -40;
    reasons.push('✅ Certificate found and verified in official database');
  } else if (dbVerdict === 'partial_match') {
    // Partial — neutral to slightly suspicious
    score += 10;
    breakdown.db = 10;
    reasons.push('⚠️ Partial match found in database — some fields differ');
  } else if (dbVerdict === 'not_found') {
    // Not in official DB — raise suspicion
    score += 25;
    breakdown.db = 25;
    reasons.push('❌ Certificate not found in official database');
  } else {
    breakdown.db = 0;
  }

  // ── AI analysis scoring ────────────────────────────────────────────────────
  if (aiAnalysis) {
    const aiWeight = dbVerdict === 'verified' ? 0.3 : 0.6; // trust AI more when DB has no record
    const aiContribution = Math.round((aiAnalysis.score - 50) * aiWeight);
    score += aiContribution;
    breakdown.ai = aiContribution;
    if (aiAnalysis.reasons) reasons.push(...aiAnalysis.reasons.filter(r => !reasons.includes(r)));
  } else {
    breakdown.ai = 0;
  }

  // ── Field completeness scoring ─────────────────────────────────────────────
  const requiredFields = ['name', 'university', 'year'];
  const missingFields  = requiredFields.filter(f => !extractedFields[f]);
  if (missingFields.length > 0) {
    score += missingFields.length * 8;
    breakdown.fields = missingFields.length * 8;
    reasons.push(`Missing required fields: ${missingFields.join(', ')}`);
  } else {
    breakdown.fields = 0;
  }

  // ── Clamp score 0–100 ──────────────────────────────────────────────────────
  const finalScore = Math.min(100, Math.max(0, Math.round(score)));

  // ── Determine verdict ──────────────────────────────────────────────────────
  let verdict;
  if (dbVerdict === 'verified' && finalScore <= 25) {
    verdict = 'Genuine';
  } else if (finalScore >= 70) {
    verdict = 'Fake';
  } else if (finalScore >= 35) {
    verdict = 'Review';
  } else {
    verdict = 'Genuine';
  }

  console.log(`[RiskScorer] DB=${dbVerdict} AI=${aiAnalysis?.score} Final=${finalScore} → ${verdict}`);

  return { finalScore, verdict, reasons, breakdown };
};