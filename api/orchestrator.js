import { scanVerse } from '../src/utils/chandas.js';

const MODEL_NAME = "gemini-3.1-flash-tts-preview";

// [3a] Meter Disambiguation Agent (LLM, narrow scope) (agentic.md §2 [3a])
async function disambiguateMeter(apiKey, pattern, len, candidateMeters) {
  const url = `https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  const systemPrompt = `You are a Sanskrit Meter (Chandas) classifier. You are given a syllable length, a binary weight pattern (L=Laghu, G=Guru), and a list of candidates. Select the best match from the candidates or return "irregular/vipulā" if it matches an irregular Anuṣṭubh variant. Output JSON ONLY.`;
  
  const payload = {
    contents: [
      {
        parts: [
          {
            text: `${systemPrompt}\n\nLength: ${len}\nPattern: ${pattern}\nCandidates: ${JSON.stringify(candidateMeters)}\n\nResponse format:\n{\n  "chosen_meter": "...",\n  "rationale": "..."\n}`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textResponse) {
        return JSON.parse(textResponse.trim());
      }
    }
  } catch (err) {
    console.error("Disambiguation agent failed:", err);
  }
  return null;
}

// [5] Compound Boundary Detection Agent (LLM) (agentic.md §2 [5])
async function detectCompoundBoundaries(apiKey, text) {
  const url = `https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
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
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textResponse) {
        return JSON.parse(textResponse.trim());
      }
    }
  } catch (err) {
    console.error("Compound boundaries agent failed:", err);
  }
  return null;
}

// [6] Prosody-to-Prompt Composer Agent (LLM) (agentic.md §2 [6])
async function composeStylePrompt(apiKey, annotation) {
  const url = `https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
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
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textResponse) {
        return JSON.parse(textResponse.trim());
      }
    }
  } catch (err) {
    console.error("Style prompt composer agent failed:", err);
  }
  return null;
}

// [7] Main Orchestrator Pipeline
export async function runOrchestrator(apiKey, rawText) {
  const cleanText = rawText.trim();
  const log = [];

  // Stage 1 & 2: Syllabifier & Weight Classifier (deterministic)
  const scansion = scanVerse(cleanText);
  let matchedMeter = scansion.meter;

  // Stage 3a: Conditional Meter Disambiguation Fallback
  if (scansion.meter.startsWith('Unknown') || scansion.confidence < 0.9) {
    const candidates = ['Anuṣṭubh (Śloka)', 'Indravajrā', 'Upendravajrā', 'Vasantatilakā', 'Mandākrāntā', 'Śārdūlavikrīḍita', 'Sragdharā', 'Mālinī', 'Śikhariṇī'];
    const disambigRes = await disambiguateMeter(apiKey, scansion.pattern, scansion.syllables.length, candidates);
    if (disambigRes && disambigRes.chosen_meter !== 'Unknown') {
      matchedMeter = disambigRes.chosen_meter;
      log.push({ stage: 'Stage 3a (Meter Disambiguation)', input: scansion.pattern, decision: matchedMeter, rationale: disambigRes.rationale });
    }
  }

  // Stage 5: Compound boundaries detection
  let segmentedText = cleanText;
  const compoundRes = await detectCompoundBoundaries(apiKey, cleanText);
  if (compoundRes && compoundRes.segmented_text) {
    segmentedText = compoundRes.segmented_text;
    log.push({ stage: 'Stage 5 (Compound Boundary Detection)', input: cleanText, decision: segmentedText, rationale: `Found compounds: ${JSON.stringify(compoundRes.compounds_found)}` });
  }

  // Stage 6: Prosody Annotation Construction
  const hasLongGuruRuns = scansion.pattern.includes('GGGG');
  const annotation = {
    original_text: cleanText,
    segmented_text: segmentedText,
    meter_name: matchedMeter,
    syllable_count: scansion.syllables.length,
    weights: scansion.pattern,
    yati_caesura_positions: scansion.yati || [],
    has_long_guru_runs: hasLongGuruRuns,
    estimated_duration_matras: scansion.syllables.reduce((acc, s) => acc + (s.weight === 'G' ? 2 : 1), 0),
    visarga_count: (cleanText.match(/ः/g) || []).length
  };

  // Stage 6: Compose performance prompts
  const composerOutput = await composeStylePrompt(apiKey, annotation);
  const stylePrompt = composerOutput?.style_prompt || `steady traditional Sanskrit recitation. Perfect classical pronunciation. No extra commentary.`;

  return {
    annotation,
    stylePrompt,
    disambiguationLog: log
  };
}
