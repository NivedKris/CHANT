# Sanskrit Prosody (Chandas) — Deterministic Rule Specification

This is written to be implementable directly: each rule is a decision procedure, not a description.

---

## 0. Preprocessing (before any linguistic rule applies)

1. **Unicode normalize** input to NFC. Devanagari has combining marks (mātrās, anusvāra, visarga, virāma) that must compose consistently or your regex/segmentation will silently break on some inputs.
2. **Strip/flag avagraha (ऽ)** — it marks vowel elision (a-lopa) after `e`/`o` in sandhi. It is NOT a phoneme and contributes zero syllables and zero weight. Remove it from the syllable stream but keep a marker if you need it for sandhi-reversal later.
3. **Decide your working representation.** Devanagari is the safest source of truth for virāma (halant) detection, which is the single most important signal for consonant clustering. If you transliterate to IAST/Harvard-Kyoto first, make sure your transliteration scheme preserves an explicit "no vowel here" marker — otherwise you cannot distinguish an inherent-`a` consonant from a virāma consonant, and your whole weight calculation collapses.
4. **Treat the input as continuous phonetic text**, not word-tokenized text. Syllabification and laghu/guru rules operate across word boundaries (this is what makes Sanskrit metrics different from English metrics) — `nārāyaṇāya namaḥ` syllabifies as one continuous stream, not word-by-word. Keep word-boundary indices as metadata for Layer 5 (chanting rules), but don't let them affect Layers 1–4.

---

## 1. Phoneme Inventory (needed for classification)

### Vowels (svara) — classify each as short or long at the phoneme level, independent of syllable context

| Short (hrasva) | Long (dīrgha) |
|---|---|
| अ a | आ ā |
| इ i | ई ī |
| उ u | ऊ ū |
| ऋ ṛ | ॠ ṝ |
| ऌ ḷ | ॡ ḹ |
| — | ए e (always long — diphthong) |
| — | ऐ ai (always long — diphthong) |
| — | ओ o (always long — diphthong) |
| — | औ au (always long — diphthong) |

**Hard rule:** e, ai, o, au have no short counterpart in classical Sanskrit phonology. They are unconditionally long regardless of what follows. Do not run them through the "short vowel + condition" branch below — treat their guru status as settled at the vowel-identification step.

### Consonants
All consonants (क through ह्, including sibilants ś/ṣ/s and semivowels y/r/l/v) are weight-neutral by themselves. Their only role is (a) forming syllable onsets, (b) triggering guru-by-position when clustered, (c) anusvāra/visarga which are technically consonant-class marks, not vowels.

### Special marks
- **Anusvāra (ं)** — nasalization mark, always closes the syllable, always triggers guru.
- **Visarga (ः)** — voiceless aspiration mark, always closes the syllable, always triggers guru.
- **Virāma/halant (्)** — explicit vowel-suppression on a consonant; the primary signal for "these consonants are clustered/conjunct" or "this consonant is word/pada-final with no following vowel."

---

## 2. Syllabification Algorithm (Akṣara Segmentation)

**Definition:** an akṣara = the maximal run of consonants immediately preceding a vowel, plus that vowel (plus anusvāra/visarga if attached to it).

### Algorithm (deterministic, single left-to-right pass)

```
input: normalized phoneme stream (list of tokens: consonants, vowels, anusvara, visarga)
output: list of syllables, each = {onset: [consonants], nucleus: vowel, coda: anusvara|visarga|None}

buffer = []
syllables = []

for token in stream:
    if token is consonant:
        buffer.append(token)          # accumulate onset
    elif token is vowel:
        syllables.append({
            onset: buffer,
            nucleus: token,
            coda: None
        })
        buffer = []                    # onset consumed, reset
    elif token is anusvara or token is visarga:
        # attaches to the immediately preceding syllable's nucleus
        syllables[-1].coda = token

# end of stream: if buffer is non-empty, those are trailing consonants
# with no following vowel (word/pada-final consonant cluster, or halant consonant).
# They do NOT form a new syllable. They attach as a "closing cluster"
# to the LAST syllable already formed, and make it heavy (see Rule 3.1.d).
if buffer non-empty:
    syllables[-1].trailing_consonants = buffer
```

**Key implementation point:** consonants between two vowels ALWAYS syllabify with the *following* vowel (i.e., they become that vowel's onset), never with the preceding vowel — even when there's a whole conjunct (क्ष, त्र, ज्ञ, स्त्र). This is true regardless of how many consonants are in the cluster.

Example: `śāstra` → phoneme stream `ś ā s t r a` → syllables: `śā` (onset ś, nucleus ā) | `stra` (onset s-t-r, nucleus a). The conjunct `str` is entirely the onset of the second syllable.

This is the standard point of confusion: **syllable division and weight assignment are not the same operation.** The conjunct belongs (orthographically/phonetically) to the following syllable, but it makes the *preceding* syllable heavy. Your engine needs both: (1) the syllable boundary list, and (2) a lookahead of "how many consonants stand between this vowel and the next vowel" for weight computation. Don't try to determine weight purely from the syllable object in isolation — you need the cluster count that spans the boundary.

Worked example from your prompt:
```
nārāyaṇāya → n ā r ā y a ṇ ā y a
syllables:  nā | rā | ya | ṇā | ya
```
Each consonant here is singleton before its vowel, so no clusters — matches your example.

Worked example with conjunct:
```
kāntaḥ → k ā n t a ḥ
onset scan: k→(vowel ā)  syllable1 = kā
            n,t → (vowel a) syllable2 = nta   (onset = n,t — a real conjunct "nt")
            ḥ attaches to syllable2's nucleus as coda
syllables: kā | ntaḥ
```
This matches your example exactly — and shows why `kā` is guru: not because of its own onset, but because the *following* syllable starts with a two-consonant cluster (n-t). That lookahead is Rule 3.1.c below.

---

## 3. Laghu/Guru Determination — exact decision procedure

Evaluate in this order for **each syllable's vowel**, stop at first match:

```
def weight(syllable, next_syllable_onset_length):
    v = syllable.nucleus

    # Rule 3.1.a — long vowel by nature
    if v in {ā, ī, ū, ṝ, ḹ, e, ai, o, au}:
        return GURU

    # Rule 3.1.b — short vowel + anusvara/visarga attached to THIS syllable
    if syllable.coda in {anusvara, visarga}:
        return GURU

    # Rule 3.1.c — short vowel followed by a consonant cluster (2+ consonants)
    # before the next vowel — i.e. next syllable's onset has length >= 2,
    # OR this is the last syllable and it has trailing_consonants of length >= 1
    if next_syllable_onset_length >= 2:
        return GURU
    if syllable is last_in_pada and len(syllable.trailing_consonants) >= 1:
        return GURU

    # Rule 3.1.d — short vowel, pada-final, closed by even a SINGLE consonant
    # (word/pada-final single consonant still closes the syllable => guru)
    if syllable is last_in_pada and syllable.trailing_consonants:
        return GURU

    # otherwise
    return LAGHU
```

Note the asymmetry: **mid-verse**, a short vowel followed by a *single* intervening consonant is laghu (that consonant becomes the next syllable's onset, doesn't close this one). Only 2+ intervening consonants make it guru. But at **pada-end**, even one trailing consonant (with no vowel to attach to) closes the syllable and makes it guru, because there's no following vowel to absorb it as an onset.

### Optional/traditional rule — pada-final syllable
Classical treatises often state "pādānte guruḥ" (guru at pada-end) as a *metrical convention* — the last syllable of a line is treated as guru for scansion purposes regardless of its actual phonetic weight, because a pause naturally lengthens it. **This is not universal** — some computational implementations and some meters leave the final syllable's weight as "anceps" (don't-care) rather than force it. Decide this explicitly as a config flag (`treat_final_as_guru: bool`) rather than hardcoding — meter-matching against a fixed L/G template should mask position 8/11/etc. (last syllable) as a wildcard by default, matching only the constrained positions.

### Worked check against your examples
```
kavi → k-a | v-i
  a: short, next onset = 1 consonant (v) → LAGHU
  i: short, pada-final, no trailing consonant → LAGHU
Result: L L  ✓ matches your stated answer

kāntaḥ → kā | ntaḥ
  ā: long vowel → GURU  (not "next syllable cluster" — vowel itself is long)
  a: short, pada-final, trailing consonant = ḥ (visarga, coda) → GURU by 3.1.b
Result: G G  ✓ matches your stated answer
```

---

## 4. Meter Templates (Vṛtta) — construction method + verified common meters

Fixed-syllable meters (samavṛtta) are built from **gaṇas** — canonical 3-syllable feet — using the mnemonic **yamātārājabhānasalagāḥ**, where each successive 3-letter window gives one gaṇa's pattern:

| Gaṇa | Pattern (L/G) | Mnemonic window |
|---|---|---|
| ya | L G G | ya-mā-tā |
| ma | G G G | mā-tā-rā |
| ta | G G L | tā-rā-ja |
| ra | G L G | rā-ja-bhā |
| ja | L G L | ja-bhā-na |
| bha | G L L | bhā-na-sa |
| na | L L L | na-sa-la |
| sa | L L G | sa-la-gāḥ |

Every fixed samavṛtta is defined in classical treatises (Vṛttaratnākara, Chandaḥśāstra) as a sequence of these gaṇas, plus 0–2 trailing single syllables. **Store meters as gaṇa-sequences, not raw bit-strings** — it's the authoritative representation and self-documents where yati typically falls (gaṇa boundaries are natural pause points).

### High-confidence common meters (stotra/kāvya)

| Meter | Syllables/pada | Gaṇa formula | L/G pattern | Typical yati |
|---|---|---|---|---|
| Indravajrā | 11 | ta-ta-ja-ga-ga | G G L G G L L G L G G | after 4th, sometimes 7th |
| Upendravajrā | 11 | ja-ta-ja-ga-ga | L G L G G L L G L G G | same as above |
| Upajāti | 11 | mixed Indravajrā/Upendravajrā lines within one verse | varies per pāda | as above |
| Vasantatilakā | 14 | ta-bha-ja-ja-ga-ga | G G L G L L L G L L G L G G | 8 + 6 |
| Mandākrāntā | 17 | ma-bha-na-ta-ta-ga-ga | G G G G L L L L L G G L G G L G G | 4 + 6 + 7 |
| Śārdūlavikrīḍita | 19 | ma-sa-ja-sa-ta-ta-ga | G G G L L G L G L L L G G G L G G L G | 12 + 7 |
| Sragdharā | 21 | ma-ra-bha-na-ya-ya-ya | G G G G L G G L L L L L L G G L G G L G G | 7 + 7 + 7 |
| Mālinī | 15 | na-na-ma-ya-ya | L L L L L L G G G L G G L G G | 8 + 7 |
| Drutavilambita | 12 | na-bha-bha-ra | L L L G L L G L L G L G | usually undivided |
| Toṭaka | 12 | sa-sa-sa-sa | L L G L L G L L G L L G | 6 + 6 |
| Bhujaṅgaprayāta | 12 | ya-ya-ya-ya | L G G L G G L G G L G G | 6 + 6 |
| Śikhariṇī | 17 | ya-ma-na-sa-bha-la-ga | L G G G G G L L L L L G G L L G | 6 + 11 |

⚠️ **Do not trust this table blindly for production.** I'm confident in the gaṇa formulas above (they're the standard ones taught in every chandas primer), but a single transcription slip in a bit-pattern is exactly the kind of error that's invisible until it silently misclassifies verses. Before hardcoding:
1. Re-derive each bit pattern yourself from the gaṇa formula using the mnemonic table (it's mechanical — good as a unit test).
2. Cross-check against a second independent source — e.g. the digitized Vṛttaratnākara/Chandaḥśāstra on GRETIL, or an existing open-source chandas-identification tool's meter table (there are a few on GitHub; diffing your table against theirs is cheap insurance).
3. Encode each meter as `{name, ganas: [...], total_syllables, yati_positions, source}` so a bad entry is a one-line fix, not a buried bitstring.

### Anuṣṭubh (Śloka) — special case, NOT a fixed samavṛtta

This is the most common stotra meter and behaves differently — it's a regulated syllable-count meter, not a fixed L/G template:
- 4 pādas × 8 syllables = 32 total.
- Only positions 5, 6, 7 are constrained (per pāda-pair, odd/even pādas differ slightly):
  - Syllable 5: laghu (in the standard "pathyā" form)
  - Syllable 6: guru
  - Syllable 7: guru in odd pādas (1st, 3rd), laghu in even pādas (2nd, 4th) — this is what gives śloka its alternating cadence
- Syllables 1–4 and 8 are metrically free (any weight).
- Deviations from pathyā (called vipulā variants) exist and are classified separately — if you're matching against real corpus text, expect ~20-30% vipulā lines and don't reject them as "invalid," just tag them.

**Implementation implication:** your meter-matcher needs two matching modes — (1) strict bitmask match for samavṛttas, (2) positional-constraint match for jāti-type meters like Anuṣṭubh. Don't force everything through the same fixed-template comparator.

---

## 5. Yati (caesura) rules

Yati is a *prescribed pause position*, not a phonetic rule — it's metadata attached to the meter definition, not derived from the syllable stream. Store it as `yati_positions: [8]` (meaning: pause after the 8th syllable) per meter, as already reflected in the table above. Two tiers:
- **Obligatory** (meters like Śārdūlavikrīḍita, Sragdharā — classical treatises mark these as fixed/required)
- **Traditional/preferred but not enforced** — some meters recommend a pause without treating its violation as a prosodic defect. Tag each meter's yati as `{position, strength: "obligatory"|"conventional"}` so downstream (TTS prosody annotation) can decide how hard to pause.

---

## 6. Layer 5 — Performance/chanting rules (not metrical, but needed pre-TTS)

These are independent of chandas and should be a separate rule module:
- No breath pause inside a samāsa (compound) — requires word-boundary + compound-boundary metadata retained from preprocessing (Section 0, step 4), since Layers 1–4 deliberately discard word boundaries.
- Daṇḍa (।) → short pause; dvidaṇḍa (॥) → longer pause (end-of-verse).
- Maintain vowel continuity across sandhi joins that were reconstructed for scansion — don't let the TTS "re-insert" a hiatus that sandhi eliminated.
- Don't clip visarga — it should render as a light aspiration/echo of the preceding vowel, not silence.
- Guru syllables get roughly 2 mātrā (mora) of duration, laghu ~1 mātrā — this is the actual acoustic target your prosody annotation should hand to Gemini TTS (e.g., as relative duration/emphasis tags per syllable), rather than just L/G labels.

---

## 7. Suggested pipeline data contract

Each stage should emit a typed object so you can unit-test independently, per your own diagram:

```
Akṣara := { text, onset[], nucleus, coda, word_boundary_before: bool, compound_boundary_before: bool }
WeightedAkshara := Akṣara + { weight: L|G, rule_applied: str }   # keep rule_applied for debugging/audit
MeterMatch := { meter_name, confidence, per_pada_alignment[], yati_positions[], deviations[] }
ProsodyAnnotation := { syllable, weight, duration_hint, pause_after: none|short|long, stress_hint }
```
Keeping `rule_applied` on every syllable is worth the overhead — when a verse fails to match any meter, this is what tells you whether it's a real vipulā/exception or a bug in your weight calculator.

---

## 8. Sources to validate against (in order of authority)

1. **Classical**: Piṅgala's *Chandaḥśāstra* (earliest systematic source, terse sūtra style — hard to use directly but authoritative), Kedāra Bhaṭṭa's *Vṛttaratnākara* (most commonly cited for meter definitions with examples), Kṣemendra's *Suvṛttatilaka*.
2. **Grammars with clear syllabification/weight exposition**: Macdonell, *A Sanskrit Grammar for Students* (§notes on saṃyoga and mātrā); Coulson, *Teach Yourself Sanskrit*.
3. **Computational**: search for "Sanskrit meter identification," "chandas automatic detection," work out of Sanskrit NLP groups (e.g. Hellwig, Scharf, Goyal, Huet's Sanskrit Heritage tools) — several papers publish worked gaṇa tables and evaluation sets you can use as regression tests.
4. **Open source**: search GitHub for "chandas," "vrittam," "sanskrit-meter," "laghu-guru" — even a small existing test corpus (verse → expected L/G string) is worth more than re-deriving everything from scratch, since it doubles as your test suite.

Cross-check every meter table entry against at least one source in tier 1 or 2 before shipping — tier 3/4 tools occasionally propagate the same transcription error, so don't treat multiple computational sources agreeing as independent confirmation.