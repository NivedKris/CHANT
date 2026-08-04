# CHANT: Experiment Runbook + Paper-Writing Guide

**How to use this file:** Part 0 is the compass — question and nearest neighbors — decided once, before any lab work. Part 1 is pure experimentation: ordered, checkable, no writing. Part 2 is the paper, written only after Part 1's CSVs are frozen. Part 3 is the spine-integrity check you run before submission.

---

## PART 0 — Question and Nearest Neighbors (decide this first)

### The question

**PICO:**

- **P** — Sanskrit verses across multiple meters, synthesized by instruction-following TTS backbones
- **I** — a deterministic pipeline converting prosodic features (laghu/guru pattern, compound boundaries, yati) into natural-language directives the backbone can already act on
- **C** — four comparison text formats (raw text, generic NL wrapper, raw bracket tags, backbone-native tags) and one reference-clip system (Vāgdhenu)
- **O** — laghu:guru duration ratio (target 2:1, via forced alignment), yati precision/recall, samāsa-boundary violations, MCD, human naturalness + meter ratings

**One-sentence / grandmother-test version:**

> Does telling an AI voice how to say a syllable — in plain instructions it can already follow — make it chant Sanskrit verses with the right long/short rhythm, better than just giving it the text or a sample recording?

Keep this sentence visible while running Part 1. Any phase that doesn't feed an answer to it is a stretch goal, not a core result.

**Budget note:** the question above is fully answerable with one closed-source instruction-following backbone (Gemini) + one open-weight instruction-following backbone (Qwen3-TTS) + one non-instruction-following control (Kokoro) + the reference-clip baseline (Vāgdhenu). A second closed-source commercial backbone (e.g. `gpt-4o-mini-tts`, or ElevenLabs on its free tier) is a generalization check, added opportunistically if API credits show up — not a dependency for the core result. Design the paper so this is true throughout, not just in the Limitations section.

### Nearest neighbors — two different clusters, don't conflate them

**Same-task neighbor (closest possible — direct baseline):**

- **Vāgdhenu** (Prathosh A.P., IISc) — same verses, same language, same chant goal, reference-clip conditioned flow-matching backbone. Its own paper documents that text-side prosody conditioning is architecturally inert in its backbone — cite this as *their* documented finding, not a discovery of yours.

**Same-mechanism neighbors (the ones that actually validate your method — cite these as your real related work):**

- **PromptTTS / PromptTTS++** (Guo et al. 2022; Shimizu et al. 2023) — natural-language prompt → prosody/style conditioning. This is the general pattern CHANT's Stage 6 composer is an instance of.
- **InstructTTSEval** (arXiv:2506.16381) — benchmarks whether instruction-following TTS backbones actually execute complex prosodic instructions. Closest existing work to your Phase 3/4.
- **SPAM (Style Prompt Adherence Metric)** — a metric for exactly what you're measuring: does output match what the prompt asked for.
- **"Do You Hear What I Mean?"** (arXiv:2509.13989) — quantifies where instruction-guided TTS fails to realize what was asked. Directly relevant to your Phase 9 error analysis.

**Same-domain, different-task neighbor (use narrowly):**

- **PINGALA** (arXiv:2603.24413) — real, rigorous, recent. Solves *decoding-time token selection for LLM text generation*, not *prompt composition for audio synthesis*. No forced alignment, no TTS backbone, no audio. Useful for exactly one rhetorical move: the "naturalness/similarity metrics alone are insufficient, here's a reference-free structural metric instead" argument, which both papers independently need. **Do not** reuse its equation numbering, variable names (`P(z)`, `Φ_meter`), or scripted rhetorical sentences wholesale — a reviewer who knows PINGALA will read close mirroring of a paper solving a different problem as straining for resemblance rather than being evaluated on its own terms, and it will bury your actual nearest neighbors (the instruct-TTS cluster above) in a related-work section that should foreground them instead.

---

## PART 1 — EXPERIMENTATION RUNBOOK

Run phases in order. Each phase gates the next. Every step produces a concrete artifact (file, number, table) that Part 2 pulls from directly. This part contains no references to paper sections, tables, or writing.

### Phase 0 — Setup

- 0.1 Clone/confirm `prathoshap/vagdhenu` runs locally; run `scripts/setup.sh` to pull IndicF5 + BigVGAN-v2 weights.
- 0.2 Pull `prathoshap/vagdhenu-data` (HF dataset, `style_b` config); confirm `meter` and `n_syll` columns present.
- 0.3 Confirm API access/keys for: `gemini-3.1-flash-tts-preview`, OpenAI `gpt-4o-mini-tts` (documented in the instruct-TTS literature as the most reliable instruction-following backbone; billed per-character, no subscription needed), Qwen3-TTS (decide hosted vs. self-hosted weights). *(Optional, budget permitting: ElevenLabs' free tier (~10k chars/month) can cover a small Format B/B′ bracket-tag spot-check — see Phase 3.3 note.)*
- 0.4 Install Kokoro (`hexgrad/Kokoro-82M`, Apache-2.0) locally: `pip install kokoro soundfile`, `apt-get install espeak-ng`.
- 0.5 Install AI4Bharat NeMo fork for forced alignment: `git clone https://github.com/AI4Bharat/NeMo.git && cd NeMo && git checkout nemo-v2 && bash reinstall.sh`. Download `indicconformer_stt_multi_hybrid_rnnt_600m.nemo`.
- 0.6 Install `ai4bharat/indic-conformer-600m-multilingual` (MIT) for ASR-QA transcription pass.
- 0.7 Set up results directory structure: `data/`, `audio/{system}/{verse_id}.wav`, `alignments/`, `metrics/`, `logs/model_versions.csv`.
- 0.8 Create `logs/model_versions.csv`; log, for every commercial API: model string, version/date, at time of first use. Re-check and re-log at the start of every generation batch (commercial models drift).

### Phase 1 — Dataset construction

- 1.1 Pull the full verse pool from `prathoshap/vagdhenu-data` (`style_b`).
- 1.2 Supplement with verses from Mahābhārata Tātparya Nirṇaya and Śrīmad Bhāgavatam (same public-domain sources Vāgdhenu used), sourced from the karaoke-series GitHub text.
- 1.3 Tag every verse with meter label and syllable count.
- 1.4 Compute the natural meter-frequency distribution of the raw pool (expect anuṣṭubh to dominate, 48–87%).
- 1.5 Build a stratified sample: 30–50 verses per meter × 6–8 meters, target 200–400 verses total, downweighting anuṣṭubh so no meter dominates.
- 1.6 From the 6–8 meters, select 2 to fully hold out (candidates: mālinī, rucirā — rarer meters, matches Vāgdhenu's own held-out choice). Confirm neither was used in any prior format-tuning. Write held-out verse IDs to `data/heldout_ids.txt`; everything else to `data/tuning_pool.txt`.
- 1.7 Run the deterministic Stage 3 laghu/guru tagger over the full sample.
- 1.8 Run the same tagger over Vāgdhenu's own dataset annotations (ground truth).
- 1.9 Compute exact-match accuracy, tagger vs. ground truth, on ≥200 verses. Break mismatches down by category: visarga type, conjunct lookahead, vocalic ṛ, other. Write `metrics/tagger_validation.csv`.
- 1.10 **Gate check:** if exact-match accuracy on ≥200 verses is below your pre-set bar, stop and fix the tagger before Phase 2. Do not touch meter detection until this passes.

### Phase 2 — Build the five text-conditioning formats

For every verse in `data/tuning_pool.txt` and `data/heldout_ids.txt`, produce five parallel text representations:

- 2.1 **Baseline** — raw Devanagari/IAST text, no markup, no prompt.
- 2.2 **Format A** — same text with a single unstructured natural-language instruction prepended (reuse from prior work).
- 2.3 **Format B** — PIR features (compound boundaries, pause points, weight pattern) as raw bracketed tokens directly in the text stream, e.g. `[GG][pause]word[/pause]`.
- 2.4 **Format B′ (new)** — same PIR features, expressed only via the backbone's own documented tag vocabulary (for `gemini-3.1-flash-tts-preview`: its published audio-tag list, mapping "long guru run" → `[slowly]`, yati → a pause tag). `gpt-4o-mini-tts` takes voice/delivery instructions as a separate natural-language field rather than inline bracket tags, so Format B′ doesn't map onto it the same way — treat it like Qwen3-TTS below and skip B/B′ for this backbone. Build the PIR-feature → nearest documented tag lookup table once for the backbones that do support inline tags, apply mechanically.
- 2.5 **Format C / CHANT** — run the full Stage 1→6 pipeline: Unicode normalization, syllabification, L/G classification, meter/yati matching (with LLM disambiguator fallback on scansion failures), compound-boundary hyphenation, Stage 6 prosody-to-prompt composer, producing the hyphenated-text + NL-directive hybrid.
- 2.6 Store all five representations per verse in `data/manifest.csv` (columns: verse_id, meter, format, text_payload, prompt_payload).

### Phase 3 — Backbone TTS generation runs

For each format in Phase 2, synthesize audio with each applicable backbone (not every format applies to every backbone — Vāgdhenu takes reference clips, not text formats). **Core comparison (budget-independent):** Gemini (3.1) + Qwen3-TTS (open-weight) + Kokoro (negative control) + Vāgdhenu. This alone fully answers the research question in Part 0 — one instruction-following closed backbone, one instruction-following open backbone, one non-instruction-following control, one reference-clip baseline. **Stretch (3.3, conditional on API credits):** a second closed-source commercial backbone, added only if access materializes. Do not let the core comparison wait on it.

- 3.1 **`gemini-3.1-flash-tts-preview`** — Baseline, A, B, B′, C. Confirm each request's combined text+prompt payload ≤ 8,000 bytes, expected output ≤ ~655s. Save raw PCM (24kHz/16-bit mono) → WAV → `audio/gemini/{format}/{verse_id}.wav`.
- 3.2 **Vāgdhenu** — released weights as-is (no retraining), reference-clip pipeline, every verse in the sample including held-out meters (to test structural generalization limits). Output → `audio/vagdhenu/{verse_id}.wav`.
- 3.3 *(Conditional stretch — only if API credits materialize, per Part 0 budget note)* **OpenAI `gpt-4o-mini-tts`** — Baseline, A, C (skip B/B′ — instructions are a separate field, not inline tags, per Phase 2.4), as a second commercial instruction-following comparison. Billed per-character; log per-batch cost in `logs/model_versions.csv` alongside version/date. If credits don't materialize, skip 3.3 entirely — the core comparison (3.1/3.2/3.4/3.5) stands on its own and the paper should say so plainly rather than treat this as a missing result. *(Even smaller optional add-on: a 5–10 clip ElevenLabs v3 free-tier spot-check, to test bracket-tag Format B/B′ specifically — a limited-sample illustration, not a full condition, and not required for any main-text claim.)*
- 3.4 **Qwen3-TTS** (VoiceDesign or CustomVoice) — Baseline, A, C at minimum (skip B/B′ unless time permits), open-weight instruction-following comparison. Use `instruct` parameter, 15–40 words per documented sweet spot.
- 3.5 **Kokoro-82M** — Baseline and Format C text only (ignores style instructions by design — this is the point; confirm it produces audio without erroring on hyphenated/tagged text, note whether markup leaks into read-aloud output). Non-instruction-following negative control.
- 3.6 *(Optional/stretch)* **CosyVoice2** — same negative-control role if Kokoro's Sanskrit phoneme coverage proves insufficient.
- 3.7 Log every generation batch: system, format, model version/date, verse count, wall-clock time, errors.
- 3.8 First-pass listening spot-check (5–10 clips per condition) before the full batch, to catch pipeline errors early (sample rate, truncation, empty files).

### Phase 4 — ASR-based generation QA

- 4.1 Run every generated clip from Phase 3 through `ai4bharat/indic-conformer-600m-multilingual`.
- 4.2 Compute WER of ASR transcription against source verse text, per clip.
- 4.3 Apply a pre-set WER threshold (e.g. 15%) to flag hallucinated/divergent generations.
- 4.4 Do **not** silently drop flagged clips. Write `metrics/asr_qa_failures.csv` (system, format, verse_id, WER, flagged).
- 4.5 Compute failure rate per (system × format). Write `metrics/asr_qa_failure_rate_by_condition.csv`.

### Phase 5 — Forced alignment and core metrics

- 5.1 Run NeMo Forced Aligner (`align.py`, IndicConformer `.nemo`) over every clip vs. source text. Output CTM files → `alignments/{system}/{format}/{verse_id}.ctm`.
- 5.2 From each CTM, extract per-syllable duration `d(t)`.
- 5.3 Using Stage 3 weight labels (`w(t) ∈ {L, G}`), compute per-clip duration ratio:
  `R(x) = mean(d(t) for t where w(t)=G) / mean(d(t) for t where w(t)=L)`
- 5.4 Compute `Δ(x) = |R(x) − 2.0|` for every clip.
- 5.5 Detect silence gaps / F0 resets at every PIR-marked yati/pause point, and separately at every location actually detected in audio. Compute precision/recall of predicted-vs-detected pause positions per clip.
- 5.6 Count instances where a detected pause lands inside a hyphenated compound span (samāsa violation). One count per clip.
- 5.7 Compute MCD of every clip against the plain-text baseline clip for the same verse.
- 5.8 Aggregate 5.3–5.7 into one table per (system × format), mean + bootstrap 95% CI (verse-level resampling, ~10k resamples) for duration ratio, point estimates for the others. Write `metrics/main_results_table.csv`.
- 5.9 Repeat 5.1–5.8 restricted to the 2 held-out meters (`data/heldout_ids.txt`). Write `metrics/heldout_results_table.csv` separately.

### Phase 6 — Statistical testing

- 6.1 For every pair of conditions to compare, run a paired Wilcoxon signed-rank test on duration ratio, matched per verse (check for missing cells from Phase 4 QA drops first; handle before testing).
- 6.2 Apply Holm-Bonferroni correction across all pairwise tests when comparing 5+ systems at once.
- 6.3 Confirm every mean duration ratio reported anywhere has a bootstrap 95% CI attached — no bare point estimates.
- 6.4 Write `metrics/significance_tests.csv`.

### Phase 7 — Ablation runs

- 7.1 **Directive-strength sweep** (primary): re-run Phase 2.5/3.1 CHANT generation five times, varying only Stage 6's slowing-directive strength: none / mild / moderate / strong / extreme. Keep every other stage fixed.
- 7.2 For each strength level, repeat Phase 5 (duration ratio + MCD only, full sample).
- 7.3 Write `metrics/ablation_directive_strength.csv` (rows = strength, columns = duration ratio %, MCD).
- 7.4 **No Stage 5** (compound protection off): re-run generation, measure samāsa violation rate (5.6) only.
- 7.5 **No Stage 3a disambiguator**: re-run generation restricted to verses that originally needed the LLM fallback (irregular/vipulā), measure scansion failure rate.
- 7.6 **No Format A NL wrapper, structural markup only**: re-run with hyphenation/markup but no NL directive sentence, measure duration ratio + samāsa violation rate.
- 7.7 **Mismatched meter template deliberately fed in**: pick a subset, feed the wrong meter template into Stage 3a on purpose, run generation, record failure mode qualitatively (not a metric table).
- 7.8 Write `metrics/ablation_secondary.csv` for 7.4–7.6 (rows = ablation condition, columns = relevant metric only).

### Phase 8 — Human evaluation

- 8.1 Recruit 10–15 Sanskrit-literate raters. Log recruitment channel per rater in `human_eval/raters.csv`. At least one rater must have specific recitation/pārāyaṇa training, not just literary Sanskrit — flag explicitly per rater.
- 8.2 Build a stratified subsample of 60–80 clips per rater, balanced across conditions and meters.
- 8.3 Build a Latin-square / balanced randomized assignment so no rater hears the same verse across all conditions back-to-back.
- 8.4 Build the rating instrument with exactly two scales per clip: (1) general naturalness 1–5, (2) meter/rhythm correctness 1–5. Do not conflate into one MOS score.
- 8.5 Collect ratings.
- 8.6 Compute per-rater means for both scales.
- 8.7 Compute Cohen's Kappa and Krippendorff's alpha (ordinal, multi-rater) for both scales separately.
- 8.8 Write `human_eval/results_table.csv` and `human_eval/agreement.csv`.

### Phase 9 — Error-analysis data prep

- 9.1 From Phase 5's `Δ(x)`, bucket every clip per system: `Δ ≤ 0.2` / `0.2–0.4` / `0.4–0.6` / `> 0.6`. Write `metrics/error_distribution_buckets.csv`.
- 9.2 Bucket every clip per system into a conformance category (Perfect / Near-perfect / Moderate / Poor) using your set bands for "near 2:1." Write `metrics/error_conformance_table.csv`.
- 9.3 Pull clips flagged in Phase 4 (ASR-QA failures), manually listen to a sample, categorize each: (a) ASR-flagged hallucinated word, (b) backbone ignored the NL directive, (c) forced-aligner boundary error on conjunct-heavy syllable, (d) other. Write `metrics/error_causes_manual_review.csv`.

### Phase 10 — Backbone-generalization runs (stretch)

- 10.1 Pick a ~30–40 verse subset, stratified by meter, distinct from the main pool.
- 10.2 Run Format C generation on this subset through the **core set**: `gemini-3.1-flash-tts-preview` (already in Phase 3), Qwen3-TTS, Kokoro (negative control). *(Add `gpt-4o-mini-tts` only if Phase 3.3 was run.)*
- 10.3 Repeat Phase 5 metrics (duration ratio, MCD) per backbone on this subset.
- 10.4 Compute correlation between each backbone's duration-ratio results and Phase 8 human ratings for overlapping clips, if any exist; otherwise note as not computed.
- 10.5 Write `metrics/backbone_generalization_table.csv`.

### Phase 11 — Empirical case for why naturalness-only metrics are insufficient

- 11.1 From the full Phase 5 output, find a clip (or small set) where MCD is similar between Baseline and Format C but duration ratio is very different. One clean example per meter class is enough — this is a concrete existence proof, not a statistic.
- 11.2 Write example clip IDs + MCD and duration-ratio values to `metrics/naturalness_insufficiency_examples.csv`.

### Phase 12 — Final sanity pass before locking numbers

- 12.1 Re-check `logs/model_versions.csv` — every commercial model call has a version/date logged.
- 12.2 Re-check Phase 4 QA failure rates are reported, not silently dropped from any downstream table.
- 12.3 Re-check every duration-ratio mean anywhere has its 95% CI attached.
- 12.4 Confirm held-out-meter results (5.9) were computed completely independently of any tuning that touched those meters.
- 12.5 Freeze all CSVs in `metrics/` and `human_eval/` — this is your locked results set.

---

## PART 2 — PAPER-WRITING GUIDE

General shape borrows well-worn conventions from prosody/TTS papers (motivate → formalize → evaluate → error-analyze → ablate → limit honestly). Specific notation and framing are grounded in the instruct-TTS lineage (PromptTTS, InstructTTSEval, SPAM) — your true methodological neighbors — not borrowed wholesale from PINGALA, which solves a different task. PINGALA is cited exactly once, narrowly, for the evaluation-insufficiency argument in Section 2.

### Abstract

1. One sentence: Sanskrit chanting synthesis is constrained by rigid phonetic/metrical rules.
2. Name **Vāgdhenu**. Quantify its limitation with two numbers: (a) duration-ratio compression from **Phase 3.1/5.8 Baseline row**; (b) structural reference-dependency, made concrete by **Phase 3.2 + 5.9** (does Vāgdhenu degrade or fail outright on held-out meters?).
3. Introduce CHANT, one-sentence mechanism: deterministic PIR → instruction-following LLM-TTS prompt composition.
4. Headline number: CHANT's duration ratio + 95% CI from **Phase 5.8, Format C row**, vs. Baseline, with percentage improvement.
5. Close with the duration-ratio forced-alignment framework as the second contribution — more diagnostic than naturalness-only metrics. Cite **Phase 11**'s existence-proof as the one-sentence justification.

### 1. Introduction

- **Para 1** — domain background: Śikṣā/Chandas, laghu/guru, yati. Static content.
- **Para 2** — "Vāgdhenu (Prathosh A P, IISc, 2026) introduced [dataset + system]." State its MOS ~4.6 and ~5h reference corpus as context.
- **Para 3** — "However, the reference-clip mechanism reveals important limitations": (1) structural — numeric/reference conditioning is inert for arbitrary text-side steering in Vāgdhenu's flow-matching backbone, cited as *their* documented finding; (2) quantified — baseline duration-ratio compression from **Phase 5.8** vs. the classical 2:1 target.
- **Para 4** — "To address these, we propose:" numbered, one sentence each: (1) CHANT's deterministic PIR pipeline (**Phase 2.5**), no learned component, no retraining; (2) the Stage 6 prosody-to-prompt composer, testing prompt-level vs. reference-clip-level conditioning as the injection point — position this against the instruct-TTS literature (PromptTTS/InstructTTSEval), not against PINGALA; (3) a forced-alignment duration-ratio evaluation framework, motivated by **Phase 11**.
- **Closing paragraph** — quantified result summary, pulling headline numbers from **Phase 5.8/5.9**.

### 2. Duration-Ratio Forced-Alignment Evaluation Framework

**2.1 Why Naturalness Metrics Alone Are Insufficient** — This is the one place PINGALA is cited directly, because both papers independently need this argument: a reference-free structural metric matters because naturalness/similarity metrics can look fine while structural correctness fails. Build the table from **Phase 11**: example clip(s) where MCD is similar between Baseline and Format C despite very different duration ratios. Columns: system, MCD, Duration Ratio.

**2.2 Forced-Alignment Duration Ratio — Formal Definition.** Define your own notation cleanly, motivated by the instruct-TTS adherence-metric literature (SPAM) rather than borrowed from a text-generation decoding paper:

- `x` — synthesized waveform; `T` — aligned syllable sequence (**Phase 5.1**); `w: T → {L,G}` — weight function from Stage 3.
- `d(t)` — per-syllable duration from alignment boundaries (**Phase 5.2**).
- **Duration Ratio:** `R(x) = mean_{t: w(t)=G} d(t) / mean_{t: w(t)=L} d(t)`
- **Target distance:** `Δ(x) = |R(x) − 2.0|`
- **Yati precision/recall:** set-overlap between PIR-predicted pause positions and detected pause positions (**Phase 5.5**).

**2.3 Implementation Notes** — short. Name the aligner: AI4Bharat IndicConformer + NeMo Forced Aligner (**Phase 0.5, 5.1**). Defer detail to Appendix B.

**2.4 Empirical Outcome** — Table: Baseline vs. CHANT duration ratio + CI, from **Phase 5.8**. State the shift plainly: "the duration ratio increased from [baseline] to [CHANT]."

### 3. Method

**3.1 Deterministic PIR Construction** — Formalize Stages 1–5 (**Phase 2.5, 1.7**): `z` — syllabified input string; `P(z)` — its laghu/guru pattern; `H(z)` — compound-protection operator (1 iff a boundary falls inside a detected samāsa span, Stage 5); `Y(z)` — yati/pause operator (1 at daṇḍa and fixed-caesura positions per meter template). Note in a footnote if `P(z)` happens to coincide notationally with prior Sanskrit-NLP work from the same research community — that's fine as shared domain vocabulary, distinct from adopting a whole paper's apparatus.

**3.2 Prosody-to-Prompt Composer (Stage 6)** — `Φ_prosody(PIR)`: shaping function mapping structural features (long guru runs, compound spans, yati positions) to natural-language directive phrases. `prompt = Compose(text, Φ_prosody(PIR))`: instruction compilation function. Algorithm-1-style pseudocode → Appendix B. State the central architectural argument in prose right after the definitions: CHANT's `Φ_prosody` operates on the prompt fed to a *separate* instruction-following model, not on logits during decoding inside a generating model — this is a genuinely different mechanism from decoding-time approaches, worth stating plainly rather than mapped equation-for-equation onto one. Support with **Phase 3.4** (backbone-generalization) and **Phase 3.5** (Kokoro negative control): if the non-instruction-following backbone fails to respond to `Φ_prosody`-composed prompts while instruction-following backbones do, that's empirical evidence the injection point — not the presence of structural signal — is what matters.

**3.3 Backbone TTS Synthesis (Stage 7)** — One paragraph: `gemini-3.1-flash-tts-preview` exact version/date (**Phase 0.8**), output format (24kHz/16-bit mono PCM → WAV), the 8,000-byte prompt+text cap and ~655s output cap as reproducibility-relevant constraints.

**3.4 Using Format C (Hybrid Markup) Instead of Plain NL / Inline Brackets** — Representation-choice subsection, four-part rationale:

1. Reduces token-level parsing ambiguity in the TTS text frontend.
2. Avoids the literal bracket-reading failure mode — use Format B vs. B′ results on `gemini-3.1-flash-tts-preview` (**Phase 2.3/2.4 + 5.8**) directly: since it natively supports bracket-style tags, Format B's failure (reading brackets aloud) is attributable specifically to *out-of-vocabulary* bracket content, not brackets per se. State this as a specific, falsifiable mechanism, and build the main claim on Gemini alone — this doesn't need a second closed backbone to hold. *(If Phase 3.3 was run: `gpt-4o-mini-tts` sidesteps this failure mode differently — via a separate instructions field rather than in-text tags — which is corroborating, not load-bearing, evidence for the same underlying claim.)*
3. Exposes structural regularities (compound boundaries) in a form the instruction-following model can act on directly.
4. Simplifies integration with the evaluation pipeline (forced alignment parses markup out of text, not audio).

- Quantified payoff sentence: pull Format C vs. B vs. B′ duration-ratio numbers from **Phase 5.8**.

### 4. Experimental Setup

1. **Stage 6 composer implementation** — what triggers each directive type: long guru runs → slowing directive, compound detection → hyphenation, yati → pause instruction. Reference the Appendix B algorithm box. Source: **Phase 2.5**.
2. **Backbone and generation parameters** — exact model version/date (**Phase 0.8**), sampling parameters, ASR-QA retry/threshold policy (**Phase 4.3**).
3. **Systems compared** — Baseline / Format A / Format B / Format B′ / CHANT (Format C), run on the core backbone set (Gemini + Qwen3-TTS + Kokoro) / Vāgdhenu / ablations, one line each, pointing to **Phase 2 and 3**. State plainly that a second closed-source commercial backbone (Phase 3.3) was included only if API access was available, and was not required for any main-text claim.

### 5. Results

**Main table** (from **Phase 5.8**):

| System           | Duration Ratio (95% CI) | Yati Precision/Recall | Samāsa Violation Rate | MCD |
| ---------------- | ----------------------- | --------------------- | ---------------------- | --- |
| Baseline         |                         |                       |                        |     |
| Format A         |                         |                       |                        |     |
| Format B         | N/A (decoding failure)  | —                    | —                     | —  |
| Format B′       |                         |                       |                        |     |
| CHANT (Format C) |                         |                       |                        |     |
| Vāgdhenu        |                         |                       |                        |     |

*Table built on the core backbone set (Gemini for the main instruction-following row; Qwen3-TTS and Kokoro feed the Method section's injection-point argument, not this table directly). If Phase 3.3 was run, add a clearly labeled secondary table — "Table 5b: gpt-4o-mini-tts (subject to available API credits)" — rather than folding it into the main table, so the headline claim never depends on whether that backbone was accessible.*

**Key findings** — bullets, one per major comparison, one naming the best overall configuration.

**Held-out/generalization table** (from **Phase 5.9**) — same columns, presented immediately after the main table. State plainly whether Vāgdhenu structurally cannot produce a result at all here (no reference clip for unseen meters) vs. merely degraded performance — this asymmetry is CHANT-specific, say so directly.

### 6. Error Analysis

- **Distribution table** — from **Phase 9.1**: bucket by `Δ ≤0.2 / 0.2–0.4 / 0.4–0.6 / >0.6` per system.
- **Conformance table** — from **Phase 9.2**: Perfect/Near-perfect/Moderate/Poor per system.
- Prose explaining *why*, three named causes from **Phase 9.3**'s manual review: (a) ASR-flagged hallucinated words under prosodic markup pressure, (b) backbone ignoring the NL directive on long/rare meters (cite Google's own documented "voice inconsistency with prompt instructions" caveat as external corroboration), (c) forced-aligner boundary errors on conjunct-heavy syllables.

### 7. Human Evaluation

- State N raters, N samples per rater, source systems evaluated (**Phase 8.1–8.2**).
- Annotator background sentences — name the rater with recitation/pārāyaṇa training specifically (**Phase 8.1**), since that's the CHANT-specific expertise axis.
- Two-scale table:

  | Annotator            | Naturalness | Rhythm/Meter Correctness |
  | -------------------- | ----------- | ------------------------ |
  | A1                   |             |                          |
  | A2                   |             |                          |
  | ...                  |             |                          |
  | Cohen's Kappa        |             |                          |
  | Krippendorff's alpha |             |                          |

  Pull values from **Phase 8.6–8.7**.
- Discuss agreement honestly — if Kappa or alpha comes back low or negative, say so plainly.

### 8. Ablation

Primary knob: **slowing-directive strength** (none/mild/moderate/strong/extreme), from **Phase 7.1–7.3**.

| Directive Strength | Duration Ratio (%) | MCD (lower = better) |
| ------------------ | ------------------ | -------------------- |
| None               |                    |                      |
| Mild               |                    |                      |
| Moderate           |                    |                      |
| Strong             |                    |                      |
| Extreme            |                    |                      |

Figure: dual-line plot (duration ratio + MCD on same axes). Closing sentence: "Based on this ablation, we fix [directive strength] for all experiments."

Secondary ablations (**Phase 7.4–7.7**) — Stage 5 removed, Stage 3a removed, mismatched template — a second short table here, or move to an appendix if space is tight.

### 9. Conclusion

1. Restate the dual challenge (metrical correctness vs. reference-dependency).
2. Name CHANT + core mechanism in one sentence.
3. State the headline finding, quantified, from **Phase 5.8**.
4. State the secondary contribution (evaluation framework), from **Phase 11 / Section 2**.
5. Forward-looking paragraph — name 2–3 concrete extensions: cross-backbone portability (scoped correctly per **Phase 10**'s actual results, whatever they show), non-samavṛtta/variable-length meters, extending to other chant traditions.

### 10. Limitations

- **Closed-model reproducibility** — name `gemini-3.1-flash-tts-preview` exact version/date (**Phase 0.8**); state plainly that behavior may drift across versions. Cite Google's documented "voice inconsistency with prompt instructions" caveat as corroboration this is a known backbone property, not just your finding.
- **Single closed-source backbone by design** — the core comparison uses one closed-source instruction-following system (Gemini) alongside open-weight systems (Qwen3-TTS, Kokoro); a second closed-source commercial backbone (Phase 3.3) was added only where API access was available. State this as a deliberate, budget-scoped choice rather than an unexplained gap — the core claim (injection point matters more than structural signal) does not depend on how many closed-source systems were tested, only on the open-vs-closed and instruction-following-vs-not contrasts already in the core set.
- **Small evaluator pool** — N raters from **Phase 8.1**, justified by the dual-expertise requirement (classical prosody *and* chanting/recitation tradition).
- **Cross-backbone portability not fully tested at full scale** — only the ~30–40 verse subset from **Phase 10.1**; state plainly as an open question.

### Appendices

- **A — Prompts:** the exact Stage 6 composer output template. If Format B′ used a distinct tag-mapping template, include as Figure A2.
- **B — Experimentation Details:**
  - B.1: Full Stage 6 composer implementation — bullet list of concrete steps (how guru-run detection triggers directives, how compound hyphenation is inserted, how yati markers are placed, adaptive fallback if the backbone ignores a directive). Include the Stage 1→7 pipeline as an Algorithm 1 box.
  - B.2: Generation/retry management — ASR-QA re-generation policy (**Phase 4.3**), with the same specificity as any hyperparameter table (state your equivalent generation parameters explicitly).
  - B.3: Final selection/fallback policy if a generation fails QA — formalize if you have a fallback rule (e.g., regenerate at reduced directive strength, or fall back to Format A).
  - Algorithm 1: pseudocode box for the full Stage 1→7 pipeline.
- **C — Duration-Ratio Evaluation Framework Rationale:** mathematical rationale for why forced-alignment ratio separates conditions better than MOS/MCD alone, background → argument → motivation → why-the-separation-is-large, using the **Phase 11** existence-proof as the empirical anchor.
- **D — Cross-Backbone Generalization** (if Phase 10 pursued): re-run the duration-ratio + human-rating-correlation analysis (**Phase 10.3–10.4**) across backbones, and report plainly if a backbone's gains **don't** transfer, rather than only reporting positive cases.

### Ethics / Broader Impact

Cultural/religious sensitivity of chant synthesis; attribution to Vāgdhenu's dataset and weights license (confirm exact license before writing this — treat as an open verification item, not an assumption); note any watermarking behavior of the commercial backbone used, as a transparency point for synthetic religious/cultural audio.

---

## PART 3 — Alignment-Spine Check (run before freezing the draft)

1. Write the spine in 4 sentences before writing anything else: Question → Method → Result (numeric blank until Phase 5.8 lands) → Meaning.
2. Tag every Part-1 phase with which spine sentence it feeds. Anything that feeds none of the four is an appendix candidate, not main text.
3. Build the section list from the spine (Intro → Method → Eval framework → Results → Error analysis → Human eval → Ablation → Limitations), not from copying another paper's table of contents.
4. Reverse-outline once a draft exists: one-sentence job per paragraph in the margin. If the job isn't "supports Q / reports method / reports result / interprets result," cut or move it.
5. Trace backwards from every number to its phase, forward from every phase to its sentence. Flag: (a) any table number with no interpreting sentence, (b) any claim with no table behind it.
6. Read the four spine sentences alone, out loud, no supporting text. If a stranger in the field would nod at each in sequence, it holds.

---

## Cross-reference inde

# CHANT — Part 1: Experimentation Runbook, Part 2: Paper-Writing Guide

*Part 1 is pure lab work — bare, ordered, checkable steps. It does not reference paper sections, tables, or writing at all. Part 2 is where every number produced in Part 1 gets slotted into a paper that mirrors PINGALA (arXiv:2603.24413) beat-for-beat, using PINGALA's actual section numbers, equations, and rhetorical moves — not just the general shape, but the specific mechanics from the real paper you attached.*

---

# PART 1 — EXPERIMENTATION RUNBOOK

Run phases in order. Each phase gates the next one — do not skip ahead. Every step produces a concrete artifact (a file, a number, a table) that Part 2 will pull from directly.

## Phase 0 — Setup

0.1 Clone/confirm `prathoshap/vagdhenu` GitHub repo runs locally; run its `scripts/setup.sh` to pull IndicF5 + BigVGAN-v2 weights.
0.2 Pull `prathoshap/vagdhenu-data` (HF dataset, `style_b` config) — confirm `meter` and `n_syll` columns are present.
0.3 Get API access confirmed and keys set for: `gemini-3.1-flash-tts-preview`, ElevenLabs (`eleven_v3` model ID — verify current self-serve API access before relying on it), Qwen3-TTS (decide: hosted or self-hosted weights from HF).
0.4 Install Kokoro (`hexgrad/Kokoro-82M`, Apache-2.0) locally — `pip install kokoro soundfile`, `apt-get install espeak-ng`.
0.5 Install AI4Bharat NeMo fork for forced alignment: `git clone https://github.com/AI4Bharat/NeMo.git && cd NeMo && git checkout nemo-v2 && bash reinstall.sh`. Download `indicconformer_stt_multi_hybrid_rnnt_600m.nemo`.
0.6 Install `ai4bharat/indic-conformer-600m-multilingual` (MIT) for ASR-QA transcription pass.
0.7 Set up a results directory structure: `data/`, `audio/{system}/{verse_id}.wav`, `alignments/`, `metrics/`, `logs/model_versions.csv`.
0.8 Create `logs/model_versions.csv` and log, for every commercial API you'll call: model string, version/date, at time of first use. Re-check and re-log at the start of every generation batch (commercial models drift).

## Phase 1 — Dataset construction

1.1 Pull the full verse pool from `prathoshap/vagdhenu-data` (`style_b`).
1.2 Supplement with verses from Mahābhārata Tātparya Nirṇaya and Śrīmad Bhāgavatam (same public-domain sources Vāgdhenu used), sourced from the karaoke-series GitHub text.
1.3 Tag every verse with its meter label and syllable count.
1.4 Compute the natural meter-frequency distribution of the raw pool (expect anuṣṭubh to dominate, 48–87%).
1.5 Build a stratified sample: 30–50 verses per meter × 6–8 meters, target 200–400 verses total, explicitly downweighting anuṣṭubh so no meter dominates the sample.
1.6 From the 6–8 meters, select 2 to be fully held out (candidates: mālinī, rucirā — rarer meters, matches Vāgdhenu's own held-out choice). Confirm neither was used in any prior Phase-0-style format tuning. Write the held-out verse IDs to `data/heldout_ids.txt`. Everything else is `data/tuning_pool.txt`.
1.7 Run the deterministic Stage 3 laghu/guru tagger over the full sample.
1.8 Run the same tagger over Vāgdhenu's own dataset annotations (ground truth).
1.9 Compute exact-match accuracy, tagger vs. ground truth, on ≥200 verses. Break the mismatches down by category: visarga type, conjunct lookahead, vocalic ṛ, other. Write `metrics/tagger_validation.csv`.
1.10 **Gate check**: if exact-match accuracy on ≥200 verses is below your pre-set bar, stop here and fix the tagger before proceeding to Phase 2. Do not touch meter detection until this passes.

## Phase 2 — Build the five text-conditioning formats

For every verse in `data/tuning_pool.txt` and `data/heldout_ids.txt`, produce five parallel text representations:

2.1 **Baseline**: raw Devanagari/IAST text, no markup, no prompt.
2.2 **Format A**: same text with a single unstructured natural-language instruction prepended (already built from Phase 0 of prior work — reuse as-is).
2.3 **Format B**: PIR features (compound boundaries, pause points, weight pattern) inserted as raw bracketed tokens directly in the text stream, e.g. `[GG][pause]word[/pause]`.
2.4 **Format B′ (new)**: same PIR features, but expressed only using the backbone's own documented tag vocabulary (for `gemini-3.1-flash-tts-preview`: its published audio-tag list, e.g. mapping "long guru run" → `[slowly]`, yati → a pause tag; for ElevenLabs v3 use its equivalent documented tag set). Build a lookup table PIR-feature → nearest documented tag once, then apply mechanically.
2.5 **Format C / CHANT**: run the full Stage 1→6 pipeline — Unicode normalization, syllabification, L/G classification, meter/yati matching (with LLM disambiguator fallback on scansion failures), compound-boundary hyphenation, and the Stage 6 prosody-to-prompt composer — to produce the hyphenated-text + NL-directive hybrid.

2.6 Store all five representations per verse in a single manifest file (`data/manifest.csv`, columns: verse_id, meter, format, text_payload, prompt_payload).

## Phase 3 — Backbone TTS generation runs

For each of the five formats in Phase 2, synthesize audio with each applicable backbone. Not every format applies to every backbone (Vāgdhenu takes reference clips, not text formats).

3.1 **`gemini-3.1-flash-tts-preview`** — run Baseline, Format A, Format B, Format B′, Format C. Confirm each request's combined text+prompt payload is ≤ 8,000 bytes and expected output ≤ ~655 seconds before sending. Save raw PCM (24kHz/16-bit mono) → wrap in WAV header → `audio/gemini/{format}/{verse_id}.wav`.
3.2 **Vāgdhenu** — run using released weights as-is (no retraining) on the reference-clip pipeline, for every verse in the sample (including held-out meters, to test its structural inability to generalize). Output → `audio/vagdhenu/{verse_id}.wav`.
3.3 **ElevenLabs v3** — run Baseline, Format A, Format B, Format B′, Format C (same five formats) as the secondary commercial instruction-following comparison. Confirm current API access tier before batch-running.
3.4 **Qwen3-TTS** (VoiceDesign or CustomVoice variant) — run Baseline, Format A, Format C at minimum (skip B/B′ unless time permits) as the open-weight instruction-following comparison. Use the `instruct` parameter, 15–40 words per Alibaba's documented sweet spot.
3.5 **Kokoro-82M** — run Baseline and Format C text only (it ignores style instructions by design — this is the point; confirm it produces audio without erroring on hyphenated/tagged text, then note whether the hyphens/tags leak into the read-aloud output). This is the non-instruction-following negative control for isolating why CHANT needs an instruction-following backbone.
3.6 (Optional/stretch) **CosyVoice2** — same negative-control role as Kokoro if Kokoro's phoneme coverage proves insufficient for Sanskrit.
3.7 Log every generation batch: system, format, model version/date, number of verses, wall-clock time, any errors.
3.8 Do a first-pass listening spot-check (5–10 clips per condition) before running the full batch, to catch pipeline errors early (wrong sample rate, truncated audio, empty file, etc.).

## Phase 4 — ASR-based generation QA

4.1 Run every generated clip from Phase 3 through `ai4bharat/indic-conformer-600m-multilingual`.
4.2 Compute WER of the ASR transcription against the source verse text for each clip.
4.3 Apply a pre-set WER threshold (e.g. 15%) to flag hallucinated/divergent generations.
4.4 Do **not** silently drop flagged clips. Write `metrics/asr_qa_failures.csv` with columns: system, format, verse_id, WER, flagged (bool).
4.5 Compute failure rate per (system × format) condition. Write `metrics/asr_qa_failure_rate_by_condition.csv`.

## Phase 5 — Forced alignment and core metrics

5.1 Run the NeMo Forced Aligner (`align.py`, using the IndicConformer `.nemo` model) over every clip against its source text. Output CTM files → `alignments/{system}/{format}/{verse_id}.ctm`.
5.2 From each CTM, extract per-syllable duration `d(t)`.
5.3 Using the Stage 3 weight labels (`w(t) ∈ {L, G}`) for each syllable, compute per-clip duration ratio:
`R(x) = mean(d(t) for t where w(t)=G) / mean(d(t) for t where w(t)=L)`
5.4 Compute `Δ(x) = |R(x) − 2.0|` for every clip.
5.5 Detect silence gaps / F0 resets at every location the PIR marked as a yati/pause point, and separately at every location actually detected in the audio. Compute precision and recall of predicted-vs-detected pause positions per clip.
5.6 Count instances where a detected pause lands inside a hyphenated compound span (samāsa violation). One count per clip.
5.7 Compute MCD (mel-cepstral distortion) of every clip against the plain-text baseline clip for the same verse.
5.8 Aggregate all of 5.3–5.7 into one table per (system × format), with mean and bootstrap 95% CI (verse-level resampling, ~10k resamples) for the duration ratio specifically, and point estimates for the others. Write `metrics/main_results_table.csv`.
5.9 Repeat 5.1–5.8 restricted to only the 2 held-out meters (`data/heldout_ids.txt`). Write `metrics/heldout_results_table.csv` separately.

## Phase 6 — Statistical testing

6.1 For every pair of conditions you plan to compare, run a paired Wilcoxon signed-rank test on duration ratio, matched per verse (every verse must have a result under every condition being compared — check for missing cells from Phase 4 QA drops first and handle before testing).
6.2 Apply Holm-Bonferroni correction across all pairwise tests when comparing 5+ systems at once.
6.3 Confirm every mean duration ratio reported anywhere has a bootstrap 95% CI attached — no bare point estimates.
6.4 Write `metrics/significance_tests.csv`.

## Phase 7 — Ablation runs

7.1 **Directive-strength sweep** (primary ablation): re-run Phase 2.5/3.1 CHANT generation five times, varying only the Stage 6 composer's slowing-directive strength: none / mild / moderate / strong / extreme. Keep every other pipeline stage fixed.
7.2 For each of the 5 directive-strength runs, repeat Phase 5 (duration ratio + MCD only, on the full sample — not held-out-only).
7.3 Write `metrics/ablation_directive_strength.csv` (rows = strength level, columns = duration ratio %, MCD).
7.4 **No Stage 5** (compound protection off): re-run generation with Stage 5 disabled, measure samāsa violation rate (Phase 5.6) only.
7.5 **No Stage 3a disambiguator** (LLM fallback disabled): re-run generation, restricted to verses that originally required the fallback (irregular/vipulā), measure scansion failure rate.
7.6 **No Format A NL wrapper, structural markup only**: re-run generation with hyphenation/markup but no NL directive sentence, measure duration ratio + samāsa violation rate.
7.7 **Mismatched meter template deliberately fed in**: pick a subset of verses, feed the wrong meter template into Stage 3a on purpose, run generation, record what breaks (failure mode, not a metric table — qualitative notes).
7.8 Write `metrics/ablation_secondary.csv` for 7.4–7.6 combined (rows = ablation condition, columns = relevant metric only).

## Phase 8 — Human evaluation

8.1 Recruit 10–15 Sanskrit-literate raters. Log recruitment channel per rater (department affiliate, Sanskrit-studies contact, etc.) in `human_eval/raters.csv`. At least one rater must have specific recitation/pārāyaṇa training, not just literary Sanskrit — flag this explicitly per rater.
8.2 Build a stratified subsample of 60–80 clips per rater, balanced across conditions and meters (not full corpus coverage per rater).
8.3 Build a Latin-square / balanced randomized assignment so no rater hears the same verse across all conditions back-to-back.
8.4 Build the rating instrument with exactly two separate scales per clip: (1) general naturalness 1–5, (2) meter/rhythm correctness 1–5. Do not conflate into one MOS score.
8.5 Collect ratings.
8.6 Compute per-rater means for both scales.
8.7 Compute Cohen's Kappa and Krippendorff's alpha (ordinal, multi-rater) for both scales separately.
8.8 Write `human_eval/results_table.csv` and `human_eval/agreement.csv`.

## Phase 9 — Error-analysis data prep

9.1 From Phase 5's `Δ(x)` values, bucket every clip per system into: `Δ ≤ 0.2` / `0.2–0.4` / `0.4–0.6` / `> 0.6`. Write `metrics/error_distribution_buckets.csv`.
9.2 From Phase 5, bucket every clip per system into a conformance category (e.g. Perfect ratio / Near-perfect / Moderate / Poor) using whatever numeric bands you set for "near 2:1." Write `metrics/error_conformance_table.csv`.
9.3 Pull the specific clips flagged in Phase 4 (ASR-QA failures) and manually listen to a sample of them; categorize each into one of: (a) ASR-flagged hallucinated word, (b) backbone ignored the NL directive, (c) forced-aligner boundary error on conjunct-heavy syllable, (d) other. Write `metrics/error_causes_manual_review.csv`.

## Phase 10 — Backbone-generalization runs (stretch)

10.1 Pick a ~30–40 verse subset, stratified by meter, distinct sub-sample from the main pool.
10.2 Run Format C (CHANT) generation on this subset through: `gemini-3.1-flash-tts-preview` (already covered in Phase 3), ElevenLabs v3, Qwen3-TTS, and Kokoro (negative control).
10.3 Repeat Phase 5 metrics (duration ratio, MCD) for each backbone on this subset.
10.4 Compute correlation between each backbone's duration-ratio results and the human ratings collected in Phase 8 for the overlapping clips, if any overlap exists; otherwise note this as not computed.
10.5 Write `metrics/backbone_generalization_table.csv`.

## Phase 11 — Empirical case for why naturalness-only metrics are insufficient

11.1 From the full Phase 5 output, search for a clip (or small set of clips) where MCD is similar between Baseline and Format C but duration ratio is very different. This is a concrete existence proof, not a statistic — one clean example per meter class is enough.
11.2 Write these example clip IDs + their MCD and duration-ratio values to `metrics/naturalness_insufficiency_examples.csv`.

## Phase 12 — Final sanity pass before locking numbers

12.1 Re-check `logs/model_versions.csv` — every commercial model call must have a version/date logged.
12.2 Re-check Phase 4 QA failure rates are reported, not silently dropped from any downstream table.
12.3 Re-check every duration-ratio mean anywhere has its 95% CI attached.
12.4 Confirm held-out-meter results (Phase 5.9) were computed completely independently from any tuning that touched those meters.
12.5 Freeze all CSVs in `metrics/` and `human_eval/` — this is your locked results set.

---

# PART 2 — PAPER-WRITING GUIDE (mirrors PINGALA, arXiv:2603.24413)

Every subsection below names the exact PINGALA section/equation/table it mirrors, and the exact Part-1 phase/step that supplies the number. Write in that order.

## Abstract

PINGALA's abstract order: problem → name Chandomitra → quantify its limitation (73.45% vs 50.97%, spread 22.48pts; human rating 2.13 under CD) → introduce PINGALA + mechanism in one sentence → headline number (Full%=95.92/Partial%=98.31 for Phi-4+SLP1+PINGALA) → close with the cross-encoder contribution.

CHANT abstract, same order:

1. One sentence: Sanskrit chanting synthesis is constrained by rigid phonetic/metrical rules.
2. Name **Vāgdhenu** explicitly. Quantify its limitation with two numbers, exactly the way PINGALA uses the 22.48-point spread: (a) the duration-ratio compression from **Phase 3.1/Phase 5.8 Baseline row** (your 1.24x-style number), and (b) the structural reference-dependency limit, made concrete by **Phase 3.2 + Phase 5.9** (Vāgdhenu run on held-out meters — does it degrade or fail outright?).
3. Introduce CHANT, one-sentence mechanism (deterministic PIR → instruction-following LLM-TTS prompt composition).
4. Headline number: CHANT's duration ratio + 95% CI from **Phase 5.8, Format C row**, stated against the Baseline row, with percentage improvement.
5. Close with the duration-ratio forced-alignment evaluation framework as the second contribution — positioned, like PINGALA positions the cross-encoder, as more diagnostic than a naturalness-only metric. Cite the **Phase 11** existence-proof example as the one-sentence justification.

## 1. Introduction

Mirror PINGALA's four-paragraph shape exactly.

- **Para 1**: domain background — Śikṣā/Chandas, laghu/guru, yati. (Static content, no experiment needed.)
- **Para 2**: "Vāgdhenu (Prathosh A P, IISc, 2026) recently introduced [a dataset + system]. This work offers [X]." State its MOS ~4.6 and ~5h reference corpus as context, exactly the way PINGALA states Chandomitra's 8306-pair corpus size before critiquing it.
- **Para 3**: **"However, the proposed reference-clip mechanism reveals important limitations"** — then two concrete numbers, PINGALA-style:
  - Limitation 1 (structural): numeric/reference conditioning is inert for arbitrary text-side steering in Vāgdhenu's flow-matching backbone — cite this as Vāgdhenu's own documented finding, not yours.
  - Limitation 2 (quantified): the baseline duration-ratio compression number from **Phase 5.8** vs. the classical 2:1 target — this is your direct analog to PINGALA's "22.48 percentage point spread."
- **Para 4**: **"To address these limitations, we propose the following:"** — numbered (1)/(2)/(3), one sentence each:
  1. CHANT, a deterministic PIR construction pipeline (Stages 1–5, **Phase 2.5**) requiring no learned component and no retraining.
  2. A prosody-to-prompt composer (Stage 6) that tests an architectural question Vāgdhenu's paper raises but doesn't test — self-infilling reference-conditioning vs. instruction-following prompt-conditioning as the injection point. Name this your architectural claim.
  3. A forced-alignment duration-ratio evaluation framework (mirrors PINGALA's cross-encoder-in-response-to-bi-encoder move), motivated by the **Phase 11** existence-proof case.
- **Closing paragraph**: one-paragraph result summary, quantified, pulling the headline numbers from **Phase 5.8/5.9**, in PINGALA's "we show X restores Y without degrading Z" phrasing.

## 2. Duration-Ratio Forced-Alignment Evaluation Framework

Mirrors PINGALA's Section 2 exactly — this is PINGALA's own dedicated evaluation-contribution section before Method, motivate-then-formalize.

### 2.1 Why Naturalness Metrics Alone Are Insufficient

Mirrors PINGALA's Table 1 exactly (Ground Truth / PINGALA / CD, Semantic Similarity + Human Ratings, showing the bi-encoder's poor separation). Build the CHANT-equivalent table from **Phase 11**: your example clip(s) where MCD is similar between Baseline and Format C despite very different duration ratios. Present it as a small table: columns = system, MCD, Duration Ratio. State the mismatch in one sentence exactly like PINGALA's "the bi-encoder returns ~73.5% on ground truth while assigning high scores to poor translations."

### 2.2 Forced-Alignment Duration Ratio — Formal Definition

Mirror PINGALA's 3.2.1–3.2.4 notation style (they define `x`, `M`, `y`, `C(·)`, `P(z)` before touching equations). Define, in this order:

- `x` — synthesized waveform; `T` — aligned syllable sequence (from **Phase 5.1** forced alignment); `w: T → {L,G}` — weight function from Stage 3.
- `d(t)` — per-syllable duration from alignment boundaries (**Phase 5.2**).
- **Duration Ratio** (mirrors PINGALA Eq. 6's structure — a sum/mean over a structural quantity):
  `R(x) = mean_{t: w(t)=G} d(t) / mean_{t: w(t)=L} d(t)`
- **Target distance**: `Δ(x) = |R(x) − 2.0|`
- **Yati precision/recall**: define as a set-overlap between predicted pause positions (PIR-specified) and detected pause positions (**Phase 5.5**), giving a second clean formula for the appendix math section — this is your parallel to PINGALA's probability-gap definition (Eq. 2.2.5-style optimization target framing, but for pause alignment instead of translation verification).

### 2.3 Implementation Notes

Keep short, PINGALA-style (their 2.2.1 is one short paragraph). Name the aligner: AI4Bharat IndicConformer + NeMo Forced Aligner (**Phase 0.5, Phase 5.1**). Defer full detail to Appendix B, exactly as PINGALA defers LogitsProcessor internals to Appendix B.1.

### 2.4 Empirical Outcome

Table mirroring PINGALA Table 2 (positive/negative/spread) — your version: Baseline vs. CHANT duration ratio + CI, pulled directly from **Phase 5.8**. State the shift in PINGALA's exact rhetorical form: "the duration ratio increased from [baseline] to [CHANT], mirroring the probability-gap jump PINGALA reports from ~22% to ~88% for its cross-encoder."

## 3. Method

Mirrors PINGALA's Section 3 — short prose overview + fully formalized sub-mechanisms.

### 3.1 Deterministic PIR Construction

Formalize Stages 1–5 (**Phase 2.5, Phase 1.7**) the way PINGALA formalizes `P(z)` and the pāda boundary check in 3.2.1:

- `z` — syllabified input string; `P(z)` — its laghu/guru pattern (sequence of L, G symbols) — **reuse PINGALA's own `P(z)` notation directly**, since it's shared vocabulary between the two papers and both are IIT Kharagpur / Pawan Goyal group work.
- `H(z)` — compound-protection operator: binary indicator over syllable-boundary positions, 1 iff the boundary falls inside a detected samāsa span (Stage 5, **Phase 2.5**).
- `Y(z)` — yati/pause operator: 1 at daṇḍa and fixed-caesura positions per meter template.

### 3.2 Prosody-to-Prompt Composer (Stage 6)

Your equivalent of PINGALA's 3.2.2–3.2.4 (the actual decoding-time mechanism) — except CHANT's steering happens at the **prompt level**, not the logit level:

- `Φ_prosody(PIR)` — shaping function over the PIR mapping structural features (long guru runs, compound spans, yati positions) to natural-language directive phrases. This is your direct analog to PINGALA's `Φ_meter(y_{1:t})` (Eq. 2).
- `prompt = Compose(text, Φ_prosody(PIR))` — instruction compilation function, your analog to PINGALA's constrained logits operator (Eq. 4).
- Algorithm-1-style pseudocode box for the composer → Appendix B.
- **State the architectural contrast explicitly in prose, right after the definitions** — this is your paper's central architectural argument, the same way PINGALA states the shift from bi-encoder to cross-encoder as its central empirical argument: PINGALA's `Δ(v; y_{1:t-1})` operates on logits during decoding inside the generating model; CHANT's `Φ_prosody` operates on the prompt fed to a *separate* instruction-following model that performs its own internal "decoding." Pull the **Phase 3.4 (backbone-generalization)** and **Phase 3.5 (Kokoro negative control)** results in to support this claim directly: if the negative-control non-instruction-following backbone (Kokoro) fails to respond to `Φ_prosody`-composed prompts while the instruction-following backbones do, that's your empirical proof the injection point — not the presence of structural signal — is what matters (this is your version of PINGALA's C2 claim).

### 3.3 Backbone TTS Synthesis (Stage 7)

One paragraph: name `gemini-3.1-flash-tts-preview` with exact version/date (**Phase 0.8 log**), output format (24kHz/16-bit mono PCM → WAV), note the 8,000-byte prompt+text cap and ~655s output cap as reproducibility-relevant constraints (mirrors PINGALA's B.1/B.2 hyperparameter-transparency style, e.g. their explicit beam=25, length_penalty=1.0, no_repeat_ngram=3).

### 3.4 Using Format C (Hybrid Markup) Instead of Plain NL / Inline Brackets

Direct structural parallel to PINGALA's 3.3 ("Using SLP1 instead of Devanagari") — representation-choice subsection, four-part rationale + citations + one quantified payoff sentence, exactly like PINGALA's structure.

1. Reduces token-level parsing ambiguity in the TTS's text frontend (cite prior tokenization/representation literature if available, PINGALA-style).
2. Avoids the literal bracket-reading failure mode — **use Format B vs. Format B′ results from Phase 2.3/2.4 + Phase 5.8 here directly**: since both `gemini-3.1-flash-tts-preview` and ElevenLabs v3 natively support bracket-style tags, Format B's failure (reading brackets aloud) can now be attributed specifically to *out-of-vocabulary* bracket content, not brackets per se — Format B′ isolates this. State this the way PINGALA states SLP1 avoids Unicode normalization pitfalls: as a *specific, falsifiable* mechanism, not a vague "brackets are bad."
3. Exposes structural regularities (compound boundaries) in a form the instruction-following model can act on directly.
4. Simplifies integration with the existing evaluation pipeline (forced alignment doesn't need to parse markup out of the audio, only out of the text).

- **Quantified payoff sentence**, PINGALA-style ("increased the metrical alignment by 46%"): pull the Format C vs. Format B vs. Format B′ duration-ratio numbers from **Phase 5.8** directly into one sentence.

## 4. Experimental Setup

Mirror PINGALA's numbered-list style exactly — their Section 4 is three flat numbered items, not subsections.

1. **Implementation of the Stage 6 composer** (mirrors PINGALA's item 1, which references their Algorithm 1 and Appendix B.1): describe what triggers each directive type — long guru runs → slowing directive, compound detection → hyphenation, yati → pause instruction. Reference the Appendix B algorithm box. Source: **Phase 2.5**.
2. **Backbone and generation parameters** (mirrors PINGALA's beam=25/length_penalty=1.0/no_repeat_ngram=3 transparency): exact model version/date (**Phase 0.8**), any sampling parameters, the ASR-QA retry/threshold policy (**Phase 4.3**).
3. **Systems compared** (mirrors PINGALA's FT/CD/PINGALA × NLLB/Phi-4 grid): Baseline / Format A / Format B / Format B′ / CHANT (Format C) / Vāgdhenu / ablations — one line each, pointing to **Phase 2 and Phase 3**.

## 5. Results

Mirrors PINGALA's Table 5 (main grid) + Table 6 (OOD/held-out set), presented back-to-back the same way.

**Main table** (your Table 5 equivalent) — systems as rows, metrics as columns, pulled directly from **Phase 5.8**:

| System           | Duration Ratio (95% CI) | Yati Precision/Recall | Samāsa Violation Rate | MCD |
| ---------------- | ----------------------- | --------------------- | ---------------------- | --- |
| Baseline         |                         |                       |                        |     |
| Format A         |                         |                       |                        |     |
| Format B         | N/A (decoding failure)  | —                    | —                     | —  |
| Format B′       |                         |                       |                        |     |
| CHANT (Format C) |                         |                       |                        |     |
| Vāgdhenu        |                         |                       |                        |     |

**Key findings** bullets — mirror PINGALA's exact three-bullet pattern after their Table 5 (one bullet per major comparison, one bullet naming the best overall configuration).

**Held-out/generalization table** (your Table 6 equivalent, from **Phase 5.9**) — same column structure, presented immediately after the main table, exactly as PINGALA presents its OOD table right after the main result. Note in prose whether Vāgdhenu structurally cannot produce a result here at all (no reference clip for unseen meters) vs. degraded performance — PINGALA doesn't have this exact asymmetry, so state it plainly as a CHANT-specific point.

## 6. Error Analysis

Mirrors PINGALA's Section 6 (Tables 7 and 8) — separate from Results, focused on failure modes and why.

- **Distribution table** (mirrors PINGALA Table 7's Excellent/Good/Fair/Poor/Very Poor buckets): from **Phase 9.1**, bucket by `Δ ≤0.2 / 0.2–0.4 / 0.4–0.6 / >0.6` per system.
- **Conformance table** (mirrors PINGALA Table 8): from **Phase 9.2**, success/failure rate + syllable/duration-deviation categories (Perfect/Near-perfect/Moderate/Poor) per system.
- Prose explaining *why*, three named causes exactly like PINGALA's lexical-substitution / tokenization-hallucination / metric-penalizing-valid-variation trio — pull directly from **Phase 9.3**'s manual review categories: (a) ASR-flagged hallucinated words under prosodic markup pressure, (b) backbone ignoring the NL directive on long/rare meters (cite Google's own documented "voice inconsistency with prompt instructions" caveat as external corroboration), (c) forced-aligner boundary errors on conjunct-heavy syllables.

## 7. Human Evaluation

Mirror PINGALA's Section 7 structure and tone exactly — including its willingness to report a Cohen's Kappa of −0.091 plainly.

- State N raters, N samples per rater, source system(s) evaluated — from **Phase 8.1–8.2**.
- **Annotator background sentences**, written explicitly the way PINGALA writes them ("Annotator 1 holds a Master's in Sanskrit literature...Annotator 2 is a practising poet and avadhani...") — for CHANT, name the rater with recitation/pārāyaṇa training specifically (**Phase 8.1**), since that's the CHANT-specific expertise axis PINGALA's raters didn't need.
- **Two-scale table** mirroring PINGALA Table 9 exactly:

  | Annotator            | Naturalness | Rhythm/Meter Correctness |
  | -------------------- | ----------- | ------------------------ |
  | A1                   |             |                          |
  | A2                   |             |                          |
  | ...                  |             |                          |
  | Cohen's Kappa        |             |                          |
  | Krippendorff's alpha |             |                          |

  Pull values from **Phase 8.6–8.7**.
- Discuss agreement honestly, PINGALA-style ("reflecting divergent judgments... rather than clear discrepancies on metrical form") — if your Krippendorff's alpha or Kappa comes back low or negative, say so plainly, don't paper over it.

## 8. Ablation

Mirror PINGALA's Section 8 exactly — single controlled variable, one table, one figure, one closing "we fix X for all experiments" sentence.

Primary knob: **slowing-directive strength** (none/mild/moderate/strong/extreme), from **Phase 7.1–7.3**, mirroring PINGALA's β sweep (0,1,3,5,7,10) which shows an inverted-U between syntactic and semantic scores.

| Directive Strength | Duration Ratio (%) | MCD (lower = better) |
| ------------------ | ------------------ | -------------------- |
| None               |                    |                      |
| Mild               |                    |                      |
| Moderate           |                    |                      |
| Strong             |                    |                      |
| Extreme            |                    |                      |

Figure: dual-line plot (duration ratio + MCD on same axes), mirroring PINGALA's Figure 2 exactly.
Closing sentence, PINGALA-style: "Based on this ablation, we fix [directive strength] for all experiments."

Secondary ablations (**Phase 7.4–7.7**) — Stage 5 removed, Stage 3a removed, mismatched template — either a second short table here, or move to an appendix if space is tight (PINGALA keeps only β in-text and defers other implementation detail).

## 9. Conclusion

Same five-part shape as PINGALA's Conclusion:

1. Restate the dual challenge (metrical correctness vs. reference-dependency, not PINGALA's meter-vs-semantics).
2. Name CHANT + core mechanism in one sentence.
3. State the headline finding, quantified, from **Phase 5.8**.
4. State the secondary contribution (the evaluation framework), from **Phase 11 / Section 2**.
5. Forward-looking paragraph, PINGALA's exact style (they name Dravidian languages + multi-agent debate as concrete next steps, not vague "future work"): name 2–3 concrete CHANT extensions — cross-backbone portability (scoped correctly per **Phase 10**'s actual results, whatever they show), non-samavṛtta/variable-length meters, extending to other chant traditions.

## 10. Limitations

Bulleted, bolded lead-ins, exactly like PINGALA's three ("Limited model scale," "Small evaluator pool," "SLP1 not tested with NLLB").

- **Closed-model reproducibility**: name `gemini-3.1-flash-tts-preview` exact version/date (**Phase 0.8**); state plainly that behavior may drift across versions, mirroring PINGALA's unapologetic "Limited model scale" tone. Cite Google's own documented "voice inconsistency with prompt instructions" caveat as corroboration this is a known property of the backbone, not just your finding.
- **Small evaluator pool**: N raters from **Phase 8.1**, justified by the dual-expertise requirement (classical prosody *and* chanting/recitation tradition), mirroring PINGALA's exact justification structure for its 2-annotator pool.
- **Cross-backbone portability not fully tested at full scale**: only the ~30–40 verse subset from **Phase 10.1**, mirroring PINGALA's "SLP1 not tested with NLLB" pattern — state plainly as an open question, not a hedge.

## Appendices

### Appendix A — Prompts

The exact Stage 6 composer output template (mirrors PINGALA's Figure 3). If Format B′ used a distinct tag-mapping template, include it as Figure A2 (mirrors PINGALA's Figure 4 for the SLP1 variant prompt).

### Appendix B — Experimentation Details

- **B.1**: Full Stage 6 composer implementation, bullet list of concrete steps (mirrors PINGALA's B.1 exactly): how guru-run detection triggers directives, how compound hyphenation is inserted, how yati markers are placed, adaptive fallback if the backbone ignores a directive. Include the Stage 1→7 pipeline as an Algorithm 1 box, PINGALA-style (numbered lines, variable names matching Section 3).
- **B.2**: Generation/retry management — your ASR-QA re-generation policy (**Phase 4.3**), analogous to PINGALA's B.2 beam-search hyperparameter transparency (they state beam=25, return=25, length_penalty=1.0, no_repeat_ngram=3 explicitly — state your equivalent generation parameters with the same specificity).
- **B.3**: Final selection/fallback policy if a generation fails QA — analogous to PINGALA's semantic fallback formula (their Eq. 7, `score_fallback`). Formalize yours the same way if you have a fallback rule (e.g., regenerate at reduced directive strength, or fall back to Format A).
- **Algorithm 1**: pseudocode box for the full Stage 1→7 pipeline, PINGALA-style.

### Appendix C — Duration-Ratio Evaluation Framework Rationale

Mathematical rationale for why forced-alignment ratio separates conditions better than MOS/MCD alone — mirrors PINGALA's C.1–C.4 bi-encoder-vs-cross-encoder rationale chain (background → gradient-level argument → motivation → why-the-separation-is-large analysis). Write the CHANT-analogous four-part argument using the **Phase 11** existence-proof case as your C.1-equivalent empirical anchor.

### Appendix D — Cross-Backbone Generalization (if Phase 10 is pursued)

Mirrors PINGALA's Appendix D shape exactly (their D.2 re-runs the cross-encoder experiment on SLP1 vs. Devanagari and reports it evenhandedly, including the negative finding that SLP1 doesn't help the cross-encoder even though it helps generation). Your equivalent: re-run the duration-ratio + human-rating-correlation analysis (**Phase 10.3–10.4**) across backbones, and — like PINGALA's D.2 — report plainly if a backbone's gains **don't** transfer, rather than only reporting the positive cases.

## Ethics / Broader Impact

(No PINGALA equivalent section exists in the attached paper, but ARR/EACL submissions typically require one.) Cultural/religious sensitivity of chant synthesis; attribution to Vāgdhenu's dataset and weights license (confirm exact license before writing this — treat it as an open verification item, not an assumption); note any watermarking behavior of the commercial backbone used, if applicable, as a transparency point for synthetic religious/cultural audio.

---

## Cross-reference index (quick lookup while writing)

| Paper section          | Pulls from Part 1 phase(s)       |
| ---------------------- | -------------------------------- |
| Abstract               | 3.1, 5.8, 5.9, 11                |
| §1 Intro              | 5.8, 2.5                         |
| §2 Eval Framework     | 5.1–5.5, 11                     |
| §3 Method             | 1.7, 2.5, 0.8, 3.4, 3.5          |
| §4 Experimental Setup | 2, 3, 4.3                        |
| §5 Results            | 5.8, 5.9                         |
| §6 Error Analysis     | 9.1–9.3                         |
| §7 Human Eval         | 8.1–8.7                         |
| §8 Ablation           | 7.1–7.7                         |
| §9 Conclusion         | 5.8, 11, 10                      |
| §10 Limitations       | 0.8, 8.1, 10.1                   |
| Appendix A             | 2.5, 2.4                         |
| Appendix B             | 2.5, 4.3, Algorithm-1-equivalent |
| Appendix C             | 11                               |
| Appendix D             | 10.3–10.4                       |
