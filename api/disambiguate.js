import { ipUsage, MAX_TRIES } from './status.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
  }

  const { pattern, len, candidates } = req.body;
  if (!pattern) {
    return res.status(400).json({ error: "Pattern is required." });
  }

  const url = `https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
  
  const systemPrompt = `You are a Sanskrit Meter (Chandas) classifier. You are given a syllable length, a binary weight pattern (L=Laghu, G=Guru), and a list of candidates. Select the best match from the candidates or return "irregular/vipulā" if it matches an irregular Anuṣṭubh variant. Output JSON ONLY.`;
  
  const payload = {
    contents: [
      {
        parts: [
          {
            text: `${systemPrompt}\n\nLength: ${len}\nPattern: ${pattern}\nCandidates: ${JSON.stringify(candidates || [])}\n\nResponse format:\n{\n  "chosen_meter": "...",\n  "rationale": "..."\n}`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error(errText);
      return res.status(502).json({ error: "Disambiguation failed." });
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textResponse) {
      return res.status(200).json(JSON.parse(textResponse.trim()));
    }
    return res.status(500).json({ error: "Invalid model output." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
