import { scanVerse, METERS } from '../src/utils/chandas.js';

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

// [5] Heuristic Breath Planner Agent (LLM-assisted word-chunk boundary generator) (Specification 3)
async function planBreathGroups(apiKey, text) {
  const url = `https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  const prompt = `You are a breath planner for Sanskrit recitation. Identify likely unified word groups (compounds/samāsas) in the text where pauses should NOT occur. Suggest a hyphenated segmentation showing safe continuous blocks. Under absolutely no circumstances should you alter spelling. Output JSON ONLY.`;
  
  const payload = {
    contents: [
      {
        parts: [
          {
            text: `${prompt}\n\nText: ${text}\n\nResponse format:\n{\n  "segmented_text": "...",\n  "planned_breath_forbidden_groups": ["...", "..."],\n  "segmentation_confidence": 0.0\n}`
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
    console.error("Breath planner agent failed:", err);
  }
  return null;
}

// 1 & 2. Meter Verification Gate (Strict acceptance schema) (Specification 1 & 2)
function verifyMeterAcceptance(scansion, matchedMeter) {
  if (matchedMeter.startsWith('Unknown')) {
    return 'rejected';
  }
  
  // High confidence (>0.90) maps directly to verified
  if (scansion.confidence >= 0.90) {
    return 'verified';
  }
  
  // Ambiguous boundaries threshold
  if (scansion.confidence >= 0.70) {
    return 'ambiguous';
  }
  
  return 'rejected';
}

// Prosody Conflict Resolver (Priority-Based) (rules.md §6)
function resolveConflicts(meterName, yatiPositions, dandaPositions, forbiddenBreathsList) {
  const allowedBreaths = [];
  const forbiddenBreaths = [];

  // 1. Matched Obligatory Yati Caesuras (Highest priority)
  if (yatiPositions && yatiPositions.length > 0) {
    yatiPositions.forEach(pos => {
      allowedBreaths.push({ position: pos, type: 'yati', reason: `Obligatory caesura defined by matched meter: ${meterName}` });
    });
  }

  // 2. Classical Punctuation (Danda) positions
  if (dandaPositions && dandaPositions.length > 0) {
    dandaPositions.forEach(pos => {
      allowedBreaths.push({ position: pos, type: 'danda', reason: 'Classical punctuation line split boundary' });
    });
  }

  // 3. Planned forbidden breath bounds (Heuristic, lowest priority)
  if (forbiddenBreathsList && forbiddenBreathsList.length > 0) {
    forbiddenBreathsList.forEach(group => {
      forbiddenBreaths.push({ pattern: group, reason: 'Breath planner heuristic: avoid pausing inside segmented word chunks.' });
    });
  }

  return {
    priority_order: "Meter > Yati > Danda > Compound > Word boundary",
    allowedBreaths,
    forbiddenBreaths
  };
}

// Structured Acoustic Parameter Generator (Specification 5)
function generateAcousticParameters(scansion, conflictsState, customTempo) {
  // Constant standard tempo (86 BPM) to avoid meter-specific pacing confounding research metrics
  const tempo = customTempo || 86;
  
  return {
    tempo_bpm: tempo,
    pitch_variance: "low (monotone traditional chanting register)",
    guru_ratio: 2.0,
    laghu_ratio: 1.0,
    pause_yati_ms: 180,
    pause_danda_ms: 450,
    compound_pause_allowed: false,
    rules: conflictsState
  };
}

// 4. Structured Prosody Intermediate Representation (PIR) Builder (Specification 4)
function buildProsodyIntermediateRepresentation(cleanText, scansion, matchedMeter, acceptanceState, segmentedText, forbiddenBreathsList, yatiPositions, customTempo) {
  // Find danda indices in text
  const dandaPositions = [];
  for (let i = 0; i < cleanText.length; i++) {
    if (cleanText[i] === '।' || cleanText[i] === '॥') {
      dandaPositions.push(i);
    }
  }

  const conflictsState = resolveConflicts(matchedMeter, yatiPositions, dandaPositions, forbiddenBreathsList);
  const acousticParams = generateAcousticParameters(scansion, conflictsState, customTempo);

  return {
    pir_version: "2.1 (Linguistically Robust)",
    meta: {
      original_text: cleanText,
      segmented_text: segmentedText,
      meter_name: matchedMeter,
      syllable_count: scansion.syllables.length,
      meter_scansion_confidence: scansion.confidence,
      meter_acceptance_state: acceptanceState // verified | candidate | ambiguous | rejected (Specification 2)
    },
    scansion: {
      weights: scansion.pattern,
      syllables: scansion.syllables.map(s => ({ text: s.text, weight: s.weight, nucleus: s.nucleus, coda: s.coda, onset: s.onset })) // full traceability (Specification 4)
    },
    acoustic: acousticParams
  };
}

// Rendering Structured Prosody Intermediate Representation (PIR) to Speech Prompts (Specification 4)
function renderProsodyPrompt(pir) {
  let speedAdjective = "moderate, steady pace";
  const bpm = pir.acoustic.tempo_bpm;
  if (bpm >= 120) {
    speedAdjective = "extremely fast, rapid, high-speed, brisk chanting with very quick word-transitions and short pauses";
  } else if (bpm >= 100) {
    speedAdjective = "fast, brisk, quick-tempo chanting with short pauses and rapid syllables";
  } else if (bpm <= 65) {
    speedAdjective = "extremely slow, solemn, drawn-out, highly elongated chanting with very long pauses and stretched vowels";
  } else if (bpm <= 75) {
    speedAdjective = "slow, measured, solemn chanting with elongated vowels and deep pauses";
  }

  return (
    `Traditional Sanskrit recitation style: ${pir.meta.meter_name}. ` +
    `CRITICAL PACING DIRECTIVE: You MUST recite at an ${speedAdjective}.\n` +
    `Performance parameters:\n` +
    `- Tempo: ${pir.acoustic.tempo_bpm} BPM (Strictly follow this speed)\n` +
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
  let isFallbackTriggered = false;
  // Fallback only if scansion completely failed to match any samavrtta AND confidence is 0.0 (Unknown)
  // If we already identified a candidate samavrtta locally with a valid threshold (e.g. Vasantatilakā 77%),
  // we strictly PRESERVE it to avoid LLM hallucination and bad classification overrides!
  if (scansion.meter === 'Unknown (Muktaka/Free Verse)') {
    isFallbackTriggered = true;
    const candidates = ['Anuṣṭubh (Śloka)', 'Indravajrā', 'Upendravajrā', 'Vasantatilakā', 'Mandākrāntā', 'Śārdūlavikrīḍita', 'Sragdharā', 'Mālinī', 'Śikhariṇī', 'Vaṃśastha'];
    const disambigRes = await disambiguateMeter(apiKey, scansion.pattern, scansion.syllables.length, candidates);
    if (disambigRes && disambigRes.chosen_meter !== 'Unknown') {
      matchedMeter = disambigRes.chosen_meter;
      log.push({ stage: 'Stage 3a (Meter Disambiguation)', input: scansion.pattern, decision: matchedMeter, rationale: disambigRes.rationale });
    }
  }

  // Meter Acceptance Verification Gate (Specification 1 & 2)
  const acceptanceState = verifyMeterAcceptance(scansion, matchedMeter);

  // Stage 5: Compound boundaries detection (Breath-Group Segmentation Heuristic) (Specification 3)
  let segmentedText = cleanText;
  let forbiddenBreathsList = [];
  let breathPlannerConfidence = 1.0;
  const breathRes = await planBreathGroups(apiKey, cleanText);
  if (breathRes && breathRes.segmented_text) {
    segmentedText = breathRes.segmented_text;
    forbiddenBreathsList = breathRes.planned_breath_forbidden_groups || [];
    breathPlannerConfidence = breathRes.segmentation_confidence || 0.85;
    log.push({ stage: 'Stage 5 (Breath-Group Segmentation Heuristic)', input: cleanText, decision: segmentedText, rationale: `Planned forbidden breath group bounds: ${JSON.stringify(forbiddenBreathsList)}` });
  }

  // Stage 6: Prosody Intermediate Representation (PIR) Annotation Layer
  const pir = buildProsodyIntermediateRepresentation(
    cleanText, 
    scansion, 
    matchedMeter, 
    acceptanceState, 
    segmentedText, 
    forbiddenBreathsList, 
    scansion.yati || [], 
    customTempo
  );

  // Stage 8: Prompt Renderer (Translates structured PIR to speech realization directions)
  const stylePrompt = renderProsodyPrompt(pir);

  // Ablation log for research tracking
  const ablationLog = {
    pipeline_version: pir.pir_version,
    is_disambiguation_fallback_active: isFallbackTriggered,
    breath_planner_confidence_score: breathPlannerConfidence,
    meter_acceptance_state: acceptanceState,
    scansion_syllable_traceability_active: true
  };

  return {
    annotation: {
      meter_name: pir.meta.meter_name,
      segmented_text: pir.meta.segmented_text,
      weights: pir.scansion.weights,
      is_verified: pir.meta.is_verified_meter,
      meter_acceptance_state: pir.meta.meter_acceptance_state,
      scansion_trace: pir.scansion.syllables,
      acoustic_params: pir.acoustic,
      ablation: ablationLog
    },
    stylePrompt,
    disambiguationLog: log
  };
}
