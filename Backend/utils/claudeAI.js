import { GoogleGenerativeAI } from "@google/generative-ai";

export const analyzeWithClaude = async (extractedFields) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[Gemini] No API key — skipping AI analysis');
      return {
        score:         50,
        verdict:       'Review',
        reasons:       ['AI analysis skipped — no GEMINI_API_KEY in .env'],
        flaggedFields: [],
        confidence:    'Low',
      };
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }); // ✅ fixed

    const prompt = `You are an academic certificate fraud detection expert.
Analyze these extracted certificate fields for fraud indicators:
${JSON.stringify(extractedFields, null, 2)}

Check for:
1. Does the university name look real and legitimate?
2. Are the marks/percentage within realistic range (0-100%)?
3. Is the year of passing realistic (between 1950 and ${new Date().getFullYear()})?
4. Are there logical inconsistencies between fields?
5. Are mandatory fields missing or empty?
6. Does the certificate ID format look valid?
7. Any other suspicious patterns?

Respond ONLY with a valid JSON object. No extra text, no markdown fences:
{
  "score": <integer 0-100, higher means more suspicious>,
  "verdict": "<exactly one of: Genuine, Fake, Review>",
  "reasons": ["<reason 1>", "<reason 2>"],
  "flaggedFields": ["<field name>"],
  "confidence": "<exactly one of: High, Medium, Low>"
}`;

    const result = await model.generateContent(prompt);
    const text   = result.response.text().trim();
    const clean  = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      score:         Number(parsed.score)  || 50,
      verdict:       ['Genuine','Fake','Review'].includes(parsed.verdict) ? parsed.verdict : 'Review',
      reasons:       Array.isArray(parsed.reasons)       ? parsed.reasons       : [],
      flaggedFields: Array.isArray(parsed.flaggedFields) ? parsed.flaggedFields : [],
      confidence:    ['High','Medium','Low'].includes(parsed.confidence) ? parsed.confidence : 'Low',
    };
  } catch (err) {
    console.error('[Gemini AI Error]', err.message);
    return {
      score:         50,
      verdict:       'Review',
      reasons:       ['AI analysis failed — manual review required'],
      flaggedFields: [],
      confidence:    'Low',
    };
  }
};