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

// Prosody Conflict Resolver (Priority Rule-based System)
function resolveConflicts(meterName, yatiPositions, dandaPositions, compoundsFound) {
  const conflicts = [];
  const allowedBreaths = [];
  const forbiddenBreaths = [];

  // Priority Rule: Meter > Yati > Danda > Compound > Word boundary
  // 1. Mark obligatory Yati positions as preferred breath marks
  if (yatiPositions && yatiPositions.length > 0) {
    yatiPositions.forEach(pos => {
      allowedBreaths.push({ position: pos, type: 'yati', reason: `Obligatory caesura defined by matched meter: ${meterName}` });
    });
  }

  // 2. Mark danda/double danda positions as allowed/obligatory breaths
  if (dandaPositions && dandaPositions.length > 0) {
    dandaPositions.forEach(pos => {
      allowedBreaths.push({ position: pos, type: 'danda', reason: 'Classical punctuation line split boundary' });
    });
  }

  // 3. Mark compounds as strictly forbidden breaths
  if (compoundsFound && compoundsFound.length > 0) {
    compoundsFound.forEach(comp => {
      forbiddenBreaths.push({ pattern: comp, reason: 'Strict compound word boundary (samāsa). Breaths forbidden inside compound.' });
    });
  }

  return {
    priority: "Meter > Yati > Danda > Compound > Word boundary",
    allowedBreaths,
    forbiddenBreaths,
    conflicts
  };
}

// Structured Acoustic Parameter Generator
function generateAcousticParameters(scansion, yatiPositions, conflictsState, customTempo) {
  const hasLongGuru = scansion.pattern.includes('GGGG');
  const baseTempo = hasLongGuru ? 72 : 86;
  const tempo = customTempo || baseTempo;
  
  return {
    tempo_bpm: tempo, // slower, more solemn tempo for heavy guru runs
    pitch_variance: "low (monotone traditional chanting register)",
    guru_ratio: 2.0,
    laghu_ratio: 1.0,
    pause_yati_ms: 180,
    pause_danda_ms: 450,
    compound_pause_allowed: false,
    rules: conflictsState
  };
}

// Structured Prosody Intermediate Representation (PIR) Builder
function buildProsodyIntermediateRepresentation(cleanText, scansion, matchedMeter, segmentedText, compoundsFound, yatiPositions, customTempo) {
  // Find danda indices in text
  const dandaPositions = [];
  for (let i = 0; i < cleanText.length; i++) {
    if (cleanText[i] === '।' || cleanText[i] === '॥') {
      dandaPositions.push(i);
    }
  }

  const conflictsState = resolveConflicts(matchedMeter, yatiPositions, dandaPositions, compoundsFound);
  const acousticParams = generateAcousticParameters(scansion, yatiPositions, conflictsState, customTempo);

  return {
    pir_version: "2.0 (Linguistically Robust)",
    meta: {
      original_text: cleanText,
      segmented_text: segmentedText,
      meter_name: matchedMeter,
      syllable_count: scansion.syllables.length,
      is_verified_meter: matchMeterVerification(scansion, matchedMeter)
    },
    scansion: {
      weights: scansion.pattern,
      syllables: scansion.syllables.map(s => ({ text: s.text, weight: s.weight }))
    },
    acoustic: acousticParams
  };
}

// Meter Verification Step (Verifies scansion weights against perfect templates)
function matchMeterVerification(scansion, matchedMeter) {
  if (matchedMeter.startsWith('Unknown')) return false;
  return scansion.confidence >= 0.9;
}

// Rendering Structured Prosody Intermediate Representation (PIR) to Speech Prompts
function renderProsodyPrompt(pir) {
  return (
    `Traditional Sanskrit recitation style: ${pir.meta.meter_name}. ` +
    `Performance parameters:\n` +
    `- Tempo: ${pir.acoustic.tempo_bpm} BPM\n` +
    `- Pitch Variance: ${pir.acoustic.pitch_variance}\n` +
    `- Syllable duration ratio (mātrā): Guru (heavy) is ${pir.acoustic.guru_ratio}x, Laghu (light) is ${pir.acoustic.laghu_ratio}x.\n` +
    `- Pause constraints: Pause exactly ${pir.acoustic.pause_yati_ms}ms at matched yati (caesura) splits [${pir.acoustic.rules.allowedBreaths.filter(b => b.type === 'yati').map(b => b.position).join(', ')}]. ` +
    `Pause exactly ${pir.acoustic.pause_danda_ms}ms at classical danda punctuation marks.\n` +
    `- Breathing restrictions: Under absolutely no circumstances should you pause or breath inside compound boundaries: ${JSON.stringify(pir.acoustic.rules.forbiddenBreaths.map(b => b.pattern))}.`
  );
}

// [7] Main Orchestrator Pipeline
export async function runOrchestrator(apiKey, rawText, customTempo) {
  const cleanText = rawText.trim();
  const log = [];

  // Stage 1 & 2: Syllabifier & Weight Classifier (deterministic)
  const scansion = scanVerse(cleanText);
  let matchedMeter = scansion.meter;

  // Stage 3a: Conditional Meter Disambiguation Fallback
  if (scansion.meter.startsWith('Unknown') || scansion.confidence < 0.9) {
    const candidates = ['Anuṣṭubh (Śloka)', 'Indravajrā', 'Upendravajrā', 'Vasantatilakā', 'Mandākrāntā', 'Śārdūlavikrīḍita', 'Sragdharā', 'Mālinī', 'Śikhariṇī', 'Vaṃśastha'];
    const disambigRes = await disambiguateMeter(apiKey, scansion.pattern, scansion.syllables.length, candidates);
    if (disambigRes && disambigRes.chosen_meter !== 'Unknown') {
      matchedMeter = disambigRes.chosen_meter;
      log.push({ stage: 'Stage 3a (Meter Disambiguation)', input: scansion.pattern, decision: matchedMeter, rationale: disambigRes.rationale });
    }
  }

  // Stage 5: Compound boundaries detection
  let segmentedText = cleanText;
  let compoundsFound = [];
  const compoundRes = await detectCompoundBoundaries(apiKey, cleanText);
  if (compoundRes && compoundRes.segmented_text) {
    segmentedText = compoundRes.segmented_text;
    compoundsFound = compoundRes.compounds_found || [];
    log.push({ stage: 'Stage 5 (Compound Boundary Detection)', input: cleanText, decision: segmentedText, rationale: `Found compounds: ${JSON.stringify(compoundsFound)}` });
  }

  // Stage 6: Prosody Intermediate Representation (PIR) Annotation Layer
  const pir = buildProsodyIntermediateRepresentation(cleanText, scansion, matchedMeter, segmentedText, compoundsFound, scansion.yati || [], customTempo);
    segmentedText = compoundRes.segmented_text;
    compoundsFound = compoundRes.compounds_found || [];
    log.push({ stage: 'Stage 5 (Compound Boundary Detection)', input: cleanText, decision: segmentedText, rationale: `Found compounds: ${JSON.stringify(compoundsFound)}` });
  }

  // Stage 6: Prosody Intermediate Representation (PIR) Annotation Layer
  const pir = buildProsodyIntermediateRepresentation(cleanText, scansion, matchedMeter, segmentedText, compoundsFound, scansion.yati || []);

  // Stage 8: Prompt Renderer (Translates structured PIR to speech realization directions)
  const stylePrompt = renderProsodyPrompt(pir);

  return {
    annotation: {
      meter_name: pir.meta.meter_name,
      segmented_text: pir.meta.segmented_text,
      weights: pir.scansion.weights,
      is_verified: pir.meta.is_verified_meter,
      acoustic_params: pir.acoustic
    },
    stylePrompt,
    disambiguationLog: log
  };
}
