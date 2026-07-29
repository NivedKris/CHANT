/**
 * Sanskrit Prosody (Chandas) deterministic library.
 * Implements syllabification, weight (laghu/guru) classification,
 * meter matching, and yati calculation per classical rules.
 */

// 1. Phoneme classification lists
const SHORT_VOWELS = new Set(['अ', 'इ', 'उ', 'ऋ', 'ऌ', 'a', 'i', 'u', 'ṛ', 'ḷ']);
const LONG_VOWELS = new Set(['आ', 'ई', 'ऊ', 'ॠ', 'ॡ', 'ए', 'ऐ', 'ओ', 'औ', 'ā', 'ī', 'ū', 'ṝ', 'ḹ', 'e', 'ai', 'o', 'au']);

const DEVANAGARI_CONSONANTS = new Set([
  'क', 'ख', 'ग', 'घ', 'ङ',
  'च', 'छ', 'ज', 'झ', 'ञ',
  'ट', 'ठ', 'ड', 'ढ', 'ण',
  'त', 'थ', 'द', 'ध', 'न',
  'प', 'फ', 'ब', 'भ', 'म',
  'य', 'र', 'ल', 'व',
  'श', 'ष', 'स', 'ह', 'ळ', 'क्ष', 'ज्ञ'
]);

const ANUSVARA = 'ं';
const VISARGA = 'ः';
const VIRAMA = '्';
const AVAGRAHA = 'ऽ';

// Helper to determine if character is a vowel
function isVowel(char) {
  return SHORT_VOWELS.has(char) || LONG_VOWELS.has(char);
}

// Helper to determine if character is a consonant
function isConsonant(char) {
  // Checks Devanagari consonant characters (excluding matras)
  const code = char.charCodeAt(0);
  return (code >= 0x0915 && code <= 0x0939) || code === 0x0934 || DEVANAGARI_CONSONANTS.has(char);
}

// 2. Preprocessing & Phonetic Stream Extraction
export function preprocessAndTokenize(text) {
  // Normalize Unicode to NFC
  const normalized = text.normalize('NFC');
  
  const tokens = [];
  let i = 0;
  
  while (i < normalized.length) {
    const char = normalized[i];
    
    // Skip/flag avagraha
    if (char === AVAGRAHA) {
      i++;
      continue;
    }
    
    // Map Devanagari marks to vowel properties or separate tokens
    if (isConsonant(char)) {
      tokens.push({ type: 'consonant', value: char });
    } else if (char === VIRAMA) {
      tokens.push({ type: 'virama', value: char });
    } else if (char === ANUSVARA) {
      tokens.push({ type: 'anusvara', value: char });
    } else if (char === VISARGA) {
      tokens.push({ type: 'visarga', value: char });
    } else if (isVowel(char)) {
      tokens.push({ type: 'vowel', value: char });
    } else {
      // Devanagari Matras (Vowel signs) are grouped with the preceding consonant as the nucleus
      const code = char.charCodeAt(0);
      const isMatra = (code >= 0x093E && code <= 0x094C) || code === 0x0962 || code === 0x0963 || code === 0x0955 || code === 0x0956 || code === 0x0957;
      if (isMatra) {
        tokens.push({ type: 'matra', value: char });
      } else if (/\s/.test(char)) {
        tokens.push({ type: 'whitespace', value: char });
      } else if (char === '।' || char === '॥') {
        tokens.push({ type: 'punctuation', value: char });
      } else {
        tokens.push({ type: 'other', value: char });
      }
    }
    i++;
  }
  
  return tokens;
}

// 3. Syllabification (Akṣara Segmentation)
export function segmentSyllables(text) {
  const tokens = preprocessAndTokenize(text);
  const syllables = [];
  
  const MATRA_TO_VOWEL = {
    'ा': 'आ', 'ि': 'इ', 'ी': 'ई', 'ु': 'उ', 'ू': 'ऊ', 'ृ': 'ऋ', 'ॄ': 'ॠ', 'ॢ': 'ऌ', 'ॣ': 'ॡ',
    'े': 'ए', 'ै': 'ऐ', 'ो': 'ओ', 'ौ': 'औ', 'ॅ': 'ए', 'ॉ': 'ओ'
  };

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    
    if (token.type === 'whitespace' || token.type === 'punctuation' || token.type === 'other') {
      i++;
      continue;
    }
    
    if (token.type === 'consonant') {
      const onset = [token.value];
      let j = i + 1;
      
      // Consume all consonant-suppressing virama sequences to form conjunct onsets
      while (j < tokens.length && (tokens[j].type === 'virama' || (tokens[j].type === 'consonant' && tokens[j-1].type === 'virama'))) {
        onset.push(tokens[j].value);
        j++;
      }
      
      let nucleus = 'अ'; // Implicit inherent short vowel 'अ'
      let matchedLength = j - i;
      
      if (j < tokens.length && (tokens[j].type === 'matra' || tokens[j].type === 'vowel')) {
        nucleus = tokens[j].type === 'matra' ? (MATRA_TO_VOWEL[tokens[j].value] || 'अ') : tokens[j].value;
        matchedLength = (j - i) + 1;
      }
      
      // If the last character in the onset has a trailing virama and NO vowel follows,
      // it means this is a halant trailing consonant (closed syllable coda/trailing).
      // It should merge into the preceding syllable rather than creating a new short 'अ' syllable.
      if (onset[onset.length - 1] === VIRAMA) {
        if (syllables.length > 0) {
          const last = syllables[syllables.length - 1];
          const trailingConsonants = tokens.slice(i, j).map(t => t.value);
          last.trailing = last.trailing ? [...last.trailing, ...trailingConsonants] : [...trailingConsonants];
          last.text += trailingConsonants.join('');
          i = j;
          continue;
        }
      }

      const syllable = {
        onset: onset.filter(c => c !== VIRAMA),
        nucleus: nucleus,
        coda: null,
        trailing: [],
        text: tokens.slice(i, i + matchedLength).map(t => t.value).join('')
      };
      
      let nextIdx = i + matchedLength;
      if (nextIdx < tokens.length && (tokens[nextIdx].type === 'anusvara' || tokens[nextIdx].type === 'visarga')) {
        syllable.coda = tokens[nextIdx].value;
        syllable.text += tokens[nextIdx].value;
        matchedLength++;
      }
      
      syllables.push(syllable);
      i += matchedLength;
    } else if (token.type === 'vowel') {
      const syllable = {
        onset: [],
        nucleus: token.value,
        coda: null,
        trailing: [],
        text: token.value
      };
      
      let matchedLength = 1;
      let nextIdx = i + 1;
      if (nextIdx < tokens.length && (tokens[nextIdx].type === 'anusvara' || tokens[nextIdx].type === 'visarga')) {
        syllable.coda = tokens[nextIdx].value;
        syllable.text += tokens[nextIdx].value;
        matchedLength++;
      }
      
      syllables.push(syllable);
      i += matchedLength;
    } else {
      i++;
    }
  }
  
  return syllables;
}

// 4. Weight Classification (Laghu/Guru)
export function classifyWeights(syllables) {
  const weighted = [];
  
  for (let i = 0; i < syllables.length; i++) {
    const current = syllables[i];
    const next = syllables[i + 1];
    
    let isGuru = false;
    let rule = 'Short vowel (Laghu)';
    
    const v = current.nucleus;
    
    // Rule 3.1.a - Long vowel by nature
    if (LONG_VOWELS.has(v)) {
      isGuru = true;
      rule = 'Long vowel by nature (Guru)';
    }
    // Rule 3.1.b - Short vowel + anusvara/visarga coda
    else if (current.coda === ANUSVARA || current.coda === VISARGA) {
      isGuru = true;
      rule = 'Syllable has anusvāra or visarga (Guru)';
    }
    // Rule 3.1.c - Short vowel followed by a consonant cluster (2+ consonants) in next syllable onset
    else if (next && next.onset) {
      // Clean onset to ignore viramas for pure consonant count
      const consonantCount = next.onset.filter(c => c !== VIRAMA).length;
      if (consonantCount >= 2) {
        isGuru = true;
        rule = 'Followed by conjunct/consonant cluster (Guru by position)';
      }
    }
    
    // Rule 3.1.d - Trailing consonants (closed syllable at word/pada-final)
    if (!isGuru && current.trailing && current.trailing.length > 0) {
      isGuru = true;
      rule = 'Closed by trailing consonant (Guru)';
    }
    
    weighted.push({
      ...current,
      weight: isGuru ? 'G' : 'L',
      rule: rule
    });
  }
  
  return weighted;
}

// 5. Meter (Chandas) Templates & Matchers
export const GAṆAS = {
  'ya': 'LGG',
  'ma': 'GGG',
  'ta': 'GGL',
  'ra': 'GLG',
  'ja': 'LGL',
  'bha': 'GLL',
  'na': 'LLL',
  'sa': 'LLG'
};

export const METERS = [
  { name: 'Indravajrā', syllables: 11, pattern: 'GGLGGLGLGG' }, // allow last syllable anceps
  { name: 'Upendravajrā', syllables: 11, pattern: 'LGLGGLGLGG' },
  { name: 'Vasantatilakā', syllables: 14, pattern: 'GGLGLLLGLGLGG' },
  { name: 'Mandākrāntā', syllables: 17, pattern: 'GGGGLLLLLGGLGGGLG' },
  { name: 'Śārdūlavikrīḍita', syllables: 19, pattern: 'GGGLLGLGLLLGGGLGGLG' },
  { name: 'Sragdharā', syllables: 21, pattern: 'GGGGLGGLLLLLLGGLGGLGG' },
  { name: 'Mālinī', syllables: 15, pattern: 'LLLLLLGGGLGGLGG' },
  { name: 'Drutavilambita', syllables: 12, pattern: 'LLLGLLGLLGLG' },
  { name: 'Toṭaka', syllables: 12, pattern: 'LLGLLGLLGLLG' },
  { name: 'Bhujaṅgaprayāta', syllables: 12, pattern: 'LGGLGGLGGLGG' },
  { name: 'Śikhariṇī', syllables: 17, pattern: 'LGGGGGLLLLLGGLG' }
];

// Determine if the weighted pattern matches any classical samavrtta meter (ignoring final anceps)
export function matchMeter(weightedSyllables) {
  const pattern = weightedSyllables.map(s => s.weight).join('');
  const len = pattern.length;
  
  if (len === 0) return { name: 'Unknown', confidence: 0 };

  // Helper to match a single pāda pattern against samavṛtta templates
  const matchSinglePada = (p) => {
    const l = p.length;
    let bestMeterName = null;
    let bestMeterScore = 0;
    
    for (const meter of METERS) {
      if (Math.abs(meter.syllables - l) <= 1) {
        let score = 0;
        const compareLen = Math.min(meter.pattern.length, l);
        for (let j = 0; j < compareLen; j++) {
          if (j === compareLen - 1 || meter.pattern[j] === p[j]) {
            score++;
          }
        }
        const confidence = score / compareLen;
        if (confidence > bestMeterScore && confidence >= 0.8) {
          bestMeterScore = confidence;
          bestMeterName = meter.name;
        }
      }
    }
    return { name: bestMeterName, score: bestMeterScore };
  };

  // 1. If length matches a multi-pāda verse (e.g. 4 padas of 19 syllables = 76), split and evaluate
  for (const meter of METERS) {
    if (len % meter.syllables === 0 && len > meter.syllables) {
      const padasCount = len / meter.syllables;
      let matchedAll = true;
      for (let p = 0; p < padasCount; p++) {
        const padaPattern = pattern.slice(p * meter.syllables, (p + 1) * meter.syllables);
        const matchRes = matchSinglePada(padaPattern);
        if (matchRes.name !== meter.name) {
          matchedAll = false;
          break;
        }
      }
      if (matchedAll) {
        return { name: meter.name, confidence: 1.0 };
      }
    }
  }

  // 2. Check for Anuṣṭubh (Śloka) — 8 syllables per pada with specific constraints
  // In many segmentations, we might have slightly different count due to trailing punctuation, so allow 8-10 syllables
  if (len >= 8 && len <= 10) {
    // Check first 8 syllables for Anuṣṭubh metrics
    const s5 = pattern[4];
    const s6 = pattern[5];
    const s7 = pattern[6];
    
    // Anuṣṭubh pathyā constraints: 5th is laghu, 6th is guru
    if (s5 === 'L' && s6 === 'G') {
      if (s7 === 'G') {
        return { name: 'Anuṣṭubh (Śloka - Odd Pāda)', confidence: 0.95, yati: [4] };
      } else if (s7 === 'L') {
        return { name: 'Anuṣṭubh (Śloka - Even Pāda)', confidence: 0.95, yati: [4] };
      }
      return { name: 'Anuṣṭubh (Śloka - Vipulā)', confidence: 0.8, yati: [4] };
    }
    // General fallback check: 8 syllables is traditionally almost always Anuṣṭubh in classical prayers
    if (len === 8) {
      return { name: 'Anuṣṭubh (Śloka)', confidence: 0.8, yati: [4] };
    }
  }
  
  // 3. Exact/Similarity template matching for single lines
  const singleMatch = matchSinglePada(pattern);
  if (singleMatch.name) {
    return { name: singleMatch.name, confidence: singleMatch.score };
  }
  
  return { name: 'Unknown (Muktaka/Free Verse)', confidence: 0.5 };
}

// 6. Full scansion analysis pipeline
export function scanVerse(text) {
  const syllables = segmentSyllables(text);
  const weighted = classifyWeights(syllables);
  const match = matchMeter(weighted);
  
  return {
    syllables: weighted,
    pattern: weighted.map(s => s.weight).join(''),
    meter: match.name,
    confidence: match.confidence
  };
}
