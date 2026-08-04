# Agentic Meter-Aware Sanskrit Chant TTS — Action Plan

**Core hypothesis:** A deterministic rule-based dissection agent that tags a Sanskrit verse with syllable weight (laghu/guru), meter (chandas), and phrasing (yati/daṇḍa) — then hands that annotated text to an instruction-following LLM-based TTS (e.g. Gemini TTS) — can achieve designable, verse-independent prosodic correctness that a self-infilling flow-matching backbone (per Vāgdhenu's negative result) architecturally cannot.

**Positioning against prior work:** Vāgdhenu (Prathosh A P, IISc, 2026) achieves meter-awareness through *reference-clip selection*, not text-side conditioning, and explicitly shows a learned numeric conditioning embedding is inert in a self-infilling flow-matching backbone. This plan tests a different injection point — natural-language/markup instructions fed to a true instruction-following LLM architecture — which was never tested in that paper and is architecturally distinct from what they ruled out.

---

## Phase 0 — Feasibility probe (Days 1–5, no infra needed)

**Goal:** Cheaply find out if this idea has legs before investing weeks in it.

- [ ] **0.1** Pick 15 verses spanning at least 4 different meters (anuṣṭubh, vasantatilakā, śārdūlavikrīḍita, triṣṭubh) — reuse the sample verses from the Vāgdhenu demo page, since you already have reference audio for some of them to compare against.
- [ ] **0.2** By hand (no code yet), mark laghu/guru for each syllable in all 15 verses using the deterministic rule (long vowel → guru; short vowel + conjunct/anusvāra/visarga follows → guru; else laghu). This forces you to internalize the rule before automating it.
- [ ] **0.3** Design 3 candidate annotation formats to test:
  - **Format A (plain instruction):** one natural-language sentence prepended to the verse, e.g. "This is a vasantatilakā-meter verse; hold each heavy syllable roughly twice as long as a light syllable, and pause briefly at the daṇḍa."
  - **Format B (inline markup):** insert explicit tags/marks directly between syllables in the text itself (e.g. a duration or stress marker adjacent to guru syllables, a pause marker at daṇḍa).
  - **Format C (combined):** both A and B together.
- [ ] **0.4** Get Gemini TTS API access (or use AI Studio UI for this stage — no code needed yet). Read the current Gemini TTS docs for exactly what markup/tag syntax it supports before inventing your own (check `ai.google.dev` docs directly — syntax may differ from your guess).
- [ ] **0.5** Generate audio for all 15 verses × 4 conditions each (plain text baseline, Format A, B, C) = 60 audio clips. Keep a spreadsheet mapping clip → verse → condition.
- [ ] **0.6** Manually listen and log, per clip: does it sound like it's holding heavy syllables longer? Does it pause at the daṇḍa? Note this subjectively for now — objective measurement comes in 0.8.
- [ ] **0.7** If nothing shows any audible difference across formats, stop here, document this as a preliminary negative finding, and pivot fully to the FastSpeech2/duration-predictor plan from before.
- [ ] **0.8** If something shows promise: install a forced aligner (Montreal Forced Aligner) locally, align all 60 clips against their text, extract per-syllable durations, and compute a simple duration ratio: mean(guru duration) / mean(laghu duration) per clip. Compare this ratio across conditions and against the theoretical expectation (~1.8–2.2× is typical for genuinely held long syllables).
- [ ] **Decision gate:** if the annotated conditions show a statistically distinguishable shift toward the correct ratio compared to plain text, proceed to Phase 1. If not, stop and pivot — do not sink further weeks in without this signal.

---

## Phase 1 — Build the dissection agent properly (Weeks 2–4)

**Goal:** A robust, tested, reusable module that takes raw Sanskrit text and outputs a fully annotated verse. This is the artifact you'll actually describe and evaluate in your thesis.

### 1.1 Text normalization front-end
- [ ] 1.1.1 Accept input in at least Devanagari and IAST (romanized) script.
- [ ] 1.1.2 Strip editorial parentheticals, verse numbers, and non-recited metadata before any analysis (Vāgdhenu's paper flags this as a real source of bugs — copy this precaution).
- [ ] 1.1.3 Decide whether to route through Kannada orthography as Vāgdhenu does (avoids Devanagari schwa-deletion issues in Indic-trained models) — test whether Gemini TTS has this same schwa problem before assuming you need this step; it may already handle Devanagari correctly since it isn't the same backbone family.
- [ ] 1.1.4 Implement or reuse a syllabifier: split continuous sandhified text (saṃhitā) into individual syllables (akṣara), each with its vowel nucleus and consonant onset/coda.

### 1.2 Laghu/guru tagger (deterministic)
- [ ] 1.2.1 Implement the core rule: guru if vowel is long (ā ī ū e o ai au) OR if a short vowel is followed by a conjunct consonant, anusvāra, or visarga; laghu otherwise.
- [ ] 1.2.2 Handle edge cases explicitly and write a unit test for each: word-final short vowel before a conjunct across a word boundary; anusvāra homorganic realization; visarga before velars (jihvāmūlīya) vs. labials (upadhmānīya) vs. elsewhere; vocalic ṛ.
- [ ] 1.2.3 Validate against Vāgdhenu's released dataset, which already has per-syllable laghu/guru annotations — run your tagger on their verses and check you reproduce their tags exactly. This is your correctness benchmark; do not proceed until you match on at least 200 verses.

### 1.3 Meter (vṛtta) detector
- [ ] 1.3.1 Build a lookup table of known meter signatures (start with the ~10 meters in Vāgdhenu's sample set: anuṣṭubh, vasantatilakā, śārdūlavikrīḍita, triṣṭubh, vaṃśastha, drutavilambita, mālinī, jagatī, rucirā, sragdharā).
- [ ] 1.3.2 Match a verse's computed laghu/guru sequence against these signatures, per pāda (quarter-verse), ignoring quarter-final anceps positions (final syllable weight is often flexible — copy this convention from the paper).
- [ ] 1.3.3 Handle mixed-meter verses (ardhasama, matched per half-verse rather than per full verse) as a fallback case, not the default path.
- [ ] 1.3.4 Add a "meter not detected / low confidence" fallback path — don't let unmatched verses crash the pipeline; log them for manual review.

### 1.4 Phrasing/pause (yati) marker
- [ ] 1.4.1 Mark daṇḍa (verse/half-verse punctuation) positions from the source text directly — these are usually already marked in the input.
- [ ] 1.4.2 For meters with an internal caesura (yati) at a fixed position (e.g. certain long meters take a mid-verse breath), add this as a secondary, lighter pause marker distinct from the daṇḍa.

### 1.5 Output format
- [ ] 1.5.1 Design your annotated-verse schema now, on paper, before writing generation code. Decide: are heavy syllables marked with an inline symbol, an SSML-style tag, or a natural-language sentence — base this decision on what Phase 0's Format A/B/C comparison actually showed worked, not on aesthetic preference.
- [ ] 1.5.2 Write the serializer that takes (syllables, laghu/guru tags, meter, pause positions) and produces the final text-plus-markup string sent to the TTS.
- [ ] 1.5.3 Unit test the full pipeline end-to-end on 20 verses spanning your covered meters; manually inspect every output before moving on.

---

## Phase 2 — Prompting and generation harness (Week 5)

**Goal:** A repeatable, scriptable way to send annotated verses to the LLM TTS and collect audio + metadata at scale.

- [ ] 2.1 Write a thin API wrapper around Gemini TTS (or whichever LLM-TTS you settle on) that takes your Phase 1 output and constructs the final prompt (system-style instruction + annotated verse).
- [ ] 2.2 Add retry/error handling — API calls fail, rate-limit, or occasionally hallucinate extra words; log and flag any output whose recognized text (via ASR) doesn't match the input closely, so bad generations don't silently pollute your dataset.
- [ ] 2.3 Store every generation's full metadata: verse ID, meter, annotation format used, model version/timestamp (commercial models change over time — record this so a later reviewer can understand any discrepancy), and the resulting audio file.
- [ ] 2.4 Decide your annotation format now, based on Phase 0's result — don't keep testing 3 formats forever; pick one as your primary method and treat the others as an ablation you can mention briefly.

---

## Phase 3 — Dataset construction for evaluation (Weeks 6–7)

**Goal:** A large enough, balanced verse set to draw a real conclusion from, not just anecdotes.

- [ ] 3.1 Reuse Vāgdhenu's corpus-design methodology directly: don't sample verses randomly (natural text is dominated by anuṣṭubh at 48–87%); instead deliberately balance across meters, including rare ones.
- [ ] 3.2 Aim for at least 30–50 verses per meter across 6–8 meters (roughly 200–400 verses total) — large enough for a defensible statistical comparison, small enough to stay within API budget.
- [ ] 3.3 Hold out 1–2 entire meters from any format-tuning decisions you made in Phase 0/2 — these become your generalization test set, mirroring Vāgdhenu's held-out rucirā/mālinī approach.
- [ ] 3.4 Source verses from public-domain classical texts (Mahābhārata Tātparya Nirṇaya, Śrīmad Bhāgavatam — both used by Vāgdhenu, so your results are directly comparable on shared material).

---

## Phase 4 — Evaluation (Weeks 8–9)

**Goal:** Objective, reproducible metrics — the exact thing the Vāgdhenu paper says is missing from this subfield.

- [ ] 4.1 **Duration-ratio accuracy** (primary metric): force-align every generated clip, compute mean(guru duration)/mean(laghu duration) per verse, compare against the theoretical target and against a plain-text (unannotated) baseline generated from the same verses.
- [ ] 4.2 **Held-out meter generalization**: run the same metric specifically on your held-out meters — this is your strongest claim if it holds, since Vāgdhenu's reference-based approach can't generalize to a meter without a matching reference clip, while your text-instruction approach in principle should.
- [ ] 4.3 **Pause/yati correctness**: check for a measurable silence or pitch-reset at daṇḍa positions in the annotated condition vs. baseline.
- [ ] 4.4 **Naturalness floor check (MCD or similar)** against the unannotated baseline — confirm you haven't traded naturalness for correctness; report both numbers together, always.
- [ ] 4.5 **Small human listening study**: 10–15 Sanskrit-literate listeners, rating both general naturalness and explicit meter/rhythm correctness (two separate scales) — don't conflate these into one MOS number the way most prior work does.
- [ ] 4.6 **Reproducibility note**: record exact model version, API parameters, and date for every generation batch — flag this explicitly as a known limitation of building on a closed commercial model, the same way Vāgdhenu is candid about its own MOS limitations.

---

## Phase 5 — Write-up (Weeks 10–12)

- [ ] 5.1 Frame the paper explicitly as testing an architectural question the Vāgdhenu paper raises but doesn't test: whether a *true instruction-following* LLM architecture can succeed at text-side prosody conditioning where a *self-infilling flow-matching* backbone cannot.
- [ ] 5.2 Report the result honestly whichever way it goes — a clean negative result here is still a real, citable contribution (it would sharpen exactly which architectural property causes the inertness Vāgdhenu found: infilling-from-reference vs. general instruction-following).
- [ ] 5.3 Include your dissection-agent code, annotation schema, and evaluation scripts in a public release — this is now a norm in this specific subfield and strengthens the thesis's credibility.
- [ ] 5.4 Explicitly compare your generalization-to-unseen-meter numbers against what Vāgdhenu's reference-based mechanism can offer in principle (it cannot generalize to an unseen meter without a matching reference; note this structurally rather than needing to re-run their system yourself).

---

## Decision checkpoints (do not skip these)

| Checkpoint | If it fails |
|---|---|
| End of Phase 0 | Pivot fully to the from-scratch FastSpeech2/duration-predictor plan |
| End of Phase 1.2.3 (tagger validation) | Do not proceed to meter detection until tagger matches Vāgdhenu's ground truth |
| End of Phase 3 (held-out meters) | If generalization fails here, this becomes your headline negative finding, not a footnote |

## Immediate next action

Start Phase 0, step 0.1, this week — it costs a few hours and either validates or kills the whole direction before you've written a line of infrastructure code.# Agentic Meter-Aware Sanskrit Chant TTS — Action Plan

**Core hypothesis:** A deterministic rule-based dissection agent that tags a Sanskrit verse with syllable weight (laghu/guru), meter (chandas), and phrasing (yati/daṇḍa) — then hands that annotated text to an instruction-following LLM-based TTS (e.g. Gemini TTS) — can achieve designable, verse-independent prosodic correctness that a self-infilling flow-matching backbone (per Vāgdhenu's negative result) architecturally cannot.

**Positioning against prior work:** Vāgdhenu (Prathosh A P, IISc, 2026) achieves meter-awareness through *reference-clip selection*, not text-side conditioning, and explicitly shows a learned numeric conditioning embedding is inert in a self-infilling flow-matching backbone. This plan tests a different injection point — natural-language/markup instructions fed to a true instruction-following LLM architecture — which was never tested in that paper and is architecturally distinct from what they ruled out.

---

## Phase 0 — Feasibility probe (Days 1–5, no infra needed)

**Goal:** Cheaply find out if this idea has legs before investing weeks in it.

- [ ] **0.1** Pick 15 verses spanning at least 4 different meters (anuṣṭubh, vasantatilakā, śārdūlavikrīḍita, triṣṭubh) — reuse the sample verses from the Vāgdhenu demo page, since you already have reference audio for some of them to compare against.
- [ ] **0.2** By hand (no code yet), mark laghu/guru for each syllable in all 15 verses using the deterministic rule (long vowel → guru; short vowel + conjunct/anusvāra/visarga follows → guru; else laghu). This forces you to internalize the rule before automating it.
- [ ] **0.3** Design 3 candidate annotation formats to test:
  - **Format A (plain instruction):** one natural-language sentence prepended to the verse, e.g. "This is a vasantatilakā-meter verse; hold each heavy syllable roughly twice as long as a light syllable, and pause briefly at the daṇḍa."
  - **Format B (inline markup):** insert explicit tags/marks directly between syllables in the text itself (e.g. a duration or stress marker adjacent to guru syllables, a pause marker at daṇḍa).
  - **Format C (combined):** both A and B together.
- [ ] **0.4** Get Gemini TTS API access (or use AI Studio UI for this stage — no code needed yet). Read the current Gemini TTS docs for exactly what markup/tag syntax it supports before inventing your own (check `ai.google.dev` docs directly — syntax may differ from your guess).
- [ ] **0.5** Generate audio for all 15 verses × 4 conditions each (plain text baseline, Format A, B, C) = 60 audio clips. Keep a spreadsheet mapping clip → verse → condition.
- [ ] **0.6** Manually listen and log, per clip: does it sound like it's holding heavy syllables longer? Does it pause at the daṇḍa? Note this subjectively for now — objective measurement comes in 0.8.
- [ ] **0.7** If nothing shows any audible difference across formats, stop here, document this as a preliminary negative finding, and pivot fully to the FastSpeech2/duration-predictor plan from before.
- [ ] **0.8** If something shows promise: install a forced aligner (Montreal Forced Aligner) locally, align all 60 clips against their text, extract per-syllable durations, and compute a simple duration ratio: mean(guru duration) / mean(laghu duration) per clip. Compare this ratio across conditions and against the theoretical expectation (~1.8–2.2× is typical for genuinely held long syllables).
- [ ] **Decision gate:** if the annotated conditions show a statistically distinguishable shift toward the correct ratio compared to plain text, proceed to Phase 1. If not, stop and pivot — do not sink further weeks in without this signal.

---

## Phase 1 — Build the dissection agent properly (Weeks 2–4)

**Goal:** A robust, tested, reusable module that takes raw Sanskrit text and outputs a fully annotated verse. This is the artifact you'll actually describe and evaluate in your thesis.

### 1.1 Text normalization front-end
- [ ] 1.1.1 Accept input in at least Devanagari and IAST (romanized) script.
- [ ] 1.1.2 Strip editorial parentheticals, verse numbers, and non-recited metadata before any analysis (Vāgdhenu's paper flags this as a real source of bugs — copy this precaution).
- [ ] 1.1.3 Decide whether to route through Kannada orthography as Vāgdhenu does (avoids Devanagari schwa-deletion issues in Indic-trained models) — test whether Gemini TTS has this same schwa problem before assuming you need this step; it may already handle Devanagari correctly since it isn't the same backbone family.
- [ ] 1.1.4 Implement or reuse a syllabifier: split continuous sandhified text (saṃhitā) into individual syllables (akṣara), each with its vowel nucleus and consonant onset/coda.

### 1.2 Laghu/guru tagger (deterministic)
- [ ] 1.2.1 Implement the core rule: guru if vowel is long (ā ī ū e o ai au) OR if a short vowel is followed by a conjunct consonant, anusvāra, or visarga; laghu otherwise.
- [ ] 1.2.2 Handle edge cases explicitly and write a unit test for each: word-final short vowel before a conjunct across a word boundary; anusvāra homorganic realization; visarga before velars (jihvāmūlīya) vs. labials (upadhmānīya) vs. elsewhere; vocalic ṛ.
- [ ] 1.2.3 Validate against Vāgdhenu's released dataset, which already has per-syllable laghu/guru annotations — run your tagger on their verses and check you reproduce their tags exactly. This is your correctness benchmark; do not proceed until you match on at least 200 verses.

### 1.3 Meter (vṛtta) detector
- [ ] 1.3.1 Build a lookup table of known meter signatures (start with the ~10 meters in Vāgdhenu's sample set: anuṣṭubh, vasantatilakā, śārdūlavikrīḍita, triṣṭubh, vaṃśastha, drutavilambita, mālinī, jagatī, rucirā, sragdharā).
- [ ] 1.3.2 Match a verse's computed laghu/guru sequence against these signatures, per pāda (quarter-verse), ignoring quarter-final anceps positions (final syllable weight is often flexible — copy this convention from the paper).
- [ ] 1.3.3 Handle mixed-meter verses (ardhasama, matched per half-verse rather than per full verse) as a fallback case, not the default path.
- [ ] 1.3.4 Add a "meter not detected / low confidence" fallback path — don't let unmatched verses crash the pipeline; log them for manual review.

### 1.4 Phrasing/pause (yati) marker
- [ ] 1.4.1 Mark daṇḍa (verse/half-verse punctuation) positions from the source text directly — these are usually already marked in the input.
- [ ] 1.4.2 For meters with an internal caesura (yati) at a fixed position (e.g. certain long meters take a mid-verse breath), add this as a secondary, lighter pause marker distinct from the daṇḍa.

### 1.5 Output format
- [ ] 1.5.1 Design your annotated-verse schema now, on paper, before writing generation code. Decide: are heavy syllables marked with an inline symbol, an SSML-style tag, or a natural-language sentence — base this decision on what Phase 0's Format A/B/C comparison actually showed worked, not on aesthetic preference.
- [ ] 1.5.2 Write the serializer that takes (syllables, laghu/guru tags, meter, pause positions) and produces the final text-plus-markup string sent to the TTS.
- [ ] 1.5.3 Unit test the full pipeline end-to-end on 20 verses spanning your covered meters; manually inspect every output before moving on.

---

## Phase 2 — Prompting and generation harness (Week 5)

**Goal:** A repeatable, scriptable way to send annotated verses to the LLM TTS and collect audio + metadata at scale.

- [ ] 2.1 Write a thin API wrapper around Gemini TTS (or whichever LLM-TTS you settle on) that takes your Phase 1 output and constructs the final prompt (system-style instruction + annotated verse).
- [ ] 2.2 Add retry/error handling — API calls fail, rate-limit, or occasionally hallucinate extra words; log and flag any output whose recognized text (via ASR) doesn't match the input closely, so bad generations don't silently pollute your dataset.
- [ ] 2.3 Store every generation's full metadata: verse ID, meter, annotation format used, model version/timestamp (commercial models change over time — record this so a later reviewer can understand any discrepancy), and the resulting audio file.
- [ ] 2.4 Decide your annotation format now, based on Phase 0's result — don't keep testing 3 formats forever; pick one as your primary method and treat the others as an ablation you can mention briefly.

---

## Phase 3 — Dataset construction for evaluation (Weeks 6–7)

**Goal:** A large enough, balanced verse set to draw a real conclusion from, not just anecdotes.

- [ ] 3.1 Reuse Vāgdhenu's corpus-design methodology directly: don't sample verses randomly (natural text is dominated by anuṣṭubh at 48–87%); instead deliberately balance across meters, including rare ones.
- [ ] 3.2 Aim for at least 30–50 verses per meter across 6–8 meters (roughly 200–400 verses total) — large enough for a defensible statistical comparison, small enough to stay within API budget.
- [ ] 3.3 Hold out 1–2 entire meters from any format-tuning decisions you made in Phase 0/2 — these become your generalization test set, mirroring Vāgdhenu's held-out rucirā/mālinī approach.
- [ ] 3.4 Source verses from public-domain classical texts (Mahābhārata Tātparya Nirṇaya, Śrīmad Bhāgavatam — both used by Vāgdhenu, so your results are directly comparable on shared material).

---

## Phase 4 — Evaluation (Weeks 8–9)

**Goal:** Objective, reproducible metrics — the exact thing the Vāgdhenu paper says is missing from this subfield.

- [ ] 4.1 **Duration-ratio accuracy** (primary metric): force-align every generated clip, compute mean(guru duration)/mean(laghu duration) per verse, compare against the theoretical target and against a plain-text (unannotated) baseline generated from the same verses.
- [ ] 4.2 **Held-out meter generalization**: run the same metric specifically on your held-out meters — this is your strongest claim if it holds, since Vāgdhenu's reference-based approach can't generalize to a meter without a matching reference clip, while your text-instruction approach in principle should.
- [ ] 4.3 **Pause/yati correctness**: check for a measurable silence or pitch-reset at daṇḍa positions in the annotated condition vs. baseline.
- [ ] 4.4 **Naturalness floor check (MCD or similar)** against the unannotated baseline — confirm you haven't traded naturalness for correctness; report both numbers together, always.
- [ ] 4.5 **Small human listening study**: 10–15 Sanskrit-literate listeners, rating both general naturalness and explicit meter/rhythm correctness (two separate scales) — don't conflate these into one MOS number the way most prior work does.
- [ ] 4.6 **Reproducibility note**: record exact model version, API parameters, and date for every generation batch — flag this explicitly as a known limitation of building on a closed commercial model, the same way Vāgdhenu is candid about its own MOS limitations.

---

## Phase 5 — Write-up (Weeks 10–12)

- [ ] 5.1 Frame the paper explicitly as testing an architectural question the Vāgdhenu paper raises but doesn't test: whether a *true instruction-following* LLM architecture can succeed at text-side prosody conditioning where a *self-infilling flow-matching* backbone cannot.
- [ ] 5.2 Report the result honestly whichever way it goes — a clean negative result here is still a real, citable contribution (it would sharpen exactly which architectural property causes the inertness Vāgdhenu found: infilling-from-reference vs. general instruction-following).
- [ ] 5.3 Include your dissection-agent code, annotation schema, and evaluation scripts in a public release — this is now a norm in this specific subfield and strengthens the thesis's credibility.
- [ ] 5.4 Explicitly compare your generalization-to-unseen-meter numbers against what Vāgdhenu's reference-based mechanism can offer in principle (it cannot generalize to an unseen meter without a matching reference; note this structurally rather than needing to re-run their system yourself).

---

## Decision checkpoints (do not skip these)

| Checkpoint | If it fails |
|---|---|
| End of Phase 0 | Pivot fully to the from-scratch FastSpeech2/duration-predictor plan |
| End of Phase 1.2.3 (tagger validation) | Do not proceed to meter detection until tagger matches Vāgdhenu's ground truth |
| End of Phase 3 (held-out meters) | If generalization fails here, this becomes your headline negative finding, not a footnote |

## Immediate next action

Start Phase 0, step 0.1, this week — it costs a few hours and either validates or kills the whole direction before you've written a line of infrastructure code.