export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
  }

  const { annotation } = req.body;
  if (!annotation) {
    return res.status(400).json({ error: "Annotation is required." });
  }

  const url = `https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
  
  const prompt = `You are writing a short, high-fidelity recitation performance direction for a Sanskrit speech engine. Write ONE natural-language style direction (2-3 sentences) that a traditional chanter would follow based on the provided scansion metrics. Keep it concise, professional, and focus on pacing, yati (pauses), visarga aspiration, and heavy vowel lengthening. Do not alter the original text or introduce any emojis. Output JSON ONLY.`;
  
  const payload = {
    contents: [
      {
        parts: [
          {
            text: `${prompt}\n\nMetrics:\n${JSON.stringify(annotation, null, 2)}\n\nResponse format:\n{\n  "style_prompt": "..."\n}`
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
      return res.status(502).json({ error: "Style composition failed." });
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
