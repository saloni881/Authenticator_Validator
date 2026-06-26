import OfficialCertificate from '../models/OfficialCertificate.js';

// Normalize string for comparison — uppercase, remove extra spaces/punctuation
const norm = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

// Fuzzy name match — allows 1-2 word order differences
const nameMatch = (a, b) => {
  const wa = norm(a).split(' ').filter(Boolean);
  const wb = norm(b).split(' ').filter(Boolean);
  if (!wa.length || !wb.length) return false;
  const common = wa.filter(w => wb.includes(w));
  // Match if >60% of words match
  return common.length / Math.max(wa.length, wb.length) >= 0.6;
};

// Score how well two records match (0-100)
const scoreMatch = (official, extracted) => {
  let score = 0;
  const reasons = [];

  // Roll number — strongest identifier (40 pts)
  if (extracted.rollNumber && official.rollNumber) {
    if (norm(extracted.rollNumber) === norm(official.rollNumber)) {
      score += 40; reasons.push('Roll number matched');
    } else {
      reasons.push('Roll number mismatch');
      return { score: 0, reasons }; // hard fail if roll provided but wrong
    }
  }

  // Cert ID — strong identifier (35 pts)
  if (extracted.certId && official.certId) {
    if (norm(extracted.certId) === norm(official.certId)) {
      score += 35; reasons.push('Certificate ID matched');
    } else {
      reasons.push('Certificate ID mismatch');
      return { score: 0, reasons };
    }
  }

  // Name match (25 pts)
  if (extracted.name && official.studentName) {
    if (nameMatch(extracted.name, official.studentName)) {
      score += 25; reasons.push('Name matched');
    } else {
      reasons.push('Name mismatch');
      score -= 20; // penalise name mismatch
    }
  }

  // University match (20 pts)
  if (extracted.university && official.university) {
    const eu = norm(extracted.university);
    const ou = norm(official.university);
    if (eu === ou || eu.includes(ou) || ou.includes(eu)) {
      score += 20; reasons.push('University matched');
    } else {
      reasons.push('University mismatch');
    }
  }

  // Year match (10 pts)
  if (extracted.year && official.year) {
    if (norm(extracted.year) === norm(official.year)) {
      score += 10; reasons.push('Year matched');
    } else {
      reasons.push('Year mismatch');
    }
  }

  // Degree match (10 pts)
  if (extracted.degree && official.degree) {
    const ed = norm(extracted.degree);
    const od = norm(official.degree);
    if (ed.includes(od) || od.includes(ed)) {
      score += 10; reasons.push('Degree matched');
    } else {
      reasons.push('Degree mismatch');
    }
  }

  return { score: Math.max(0, score), reasons };
};

// ── Main match function ───────────────────────────────────────────────────────
export const matchAgainstOfficialRecords = async (extractedFields) => {
  // Build query — search by strongest identifiers first
  const queries = [];

  if (extractedFields.rollNumber) {
    queries.push({ rollNumber: norm(extractedFields.rollNumber) });
  }
  if (extractedFields.certId) {
    queries.push({ certId: norm(extractedFields.certId) });
  }
  if (extractedFields.name) {
    queries.push({ studentName: new RegExp(norm(extractedFields.name).split(' ')[0], 'i') });
  }

  if (!queries.length) {
    return { matched: false, confidence: 'none', verdict: 'no_identifiers', record: null, reasons: ['No identifiable fields extracted from certificate'] };
  }

  // Fetch candidates
  const candidates = await OfficialCertificate.find({
    $or: queries,
    isBlacklisted: false,
  }).limit(10);

  if (!candidates.length) {
    return {
      matched: false,
      confidence: 'none',
      verdict: 'not_found',
      record: null,
      reasons: ['No matching record found in official database'],
    };
  }

  // Score each candidate
  const scored = candidates
    .map(c => ({ record: c, ...scoreMatch(c, extractedFields) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  console.log(`[Matcher] Best match score: ${best.score} — ${best.reasons.join(', ')}`);

  // Determine verdict based on score
  if (best.score >= 70) {
    // Check if blacklisted
    if (best.record.isBlacklisted) {
      return {
        matched: true,
        confidence: 'high',
        verdict: 'blacklisted',
        record: best.record,
        score: best.score,
        reasons: [`Certificate is blacklisted: ${best.record.blacklistReason}`, ...best.reasons],
      };
    }
    return {
      matched: true,
      confidence: best.score >= 90 ? 'high' : 'medium',
      verdict: 'verified',
      record: best.record,
      score: best.score,
      reasons: best.reasons,
    };
  }

  if (best.score >= 40) {
    return {
      matched: false,
      confidence: 'low',
      verdict: 'partial_match',
      record: best.record,
      score: best.score,
      reasons: ['Partial match found — manual review recommended', ...best.reasons],
    };
  }

  return {
    matched: false,
    confidence: 'none',
    verdict: 'not_found',
    record: null,
    score: best.score,
    reasons: ['Certificate details do not match any official record', ...best.reasons],
  };
};