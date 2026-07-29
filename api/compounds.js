export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
  }

  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Text is required." });
  }

  const url = `https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
  
  const prompt = `You are an expert Sanskrit grammarian. Analyze the following continuous Sanskrit text and identify likely compound word boundaries (samāsa splits) where pauses should NOT occur. Highlight the compound splits by inserting hyphens (-) into the text. Do not translate or comment. Output JSON ONLY.`;
  
  const payload = {
    contents: [
      {
        parts: [
          {
            text: `${prompt}\n\nText: ${text}\n\nResponse format:\n{\n  "segmented_text": "...",\n  "compounds_found": ["...", "..."]\n}`
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
      return res.status(502).json({ error: "Compound segmentation failed." });
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
