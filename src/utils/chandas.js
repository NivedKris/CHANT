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
  let currentOnset = [];
  
  // Mapping of matras to corresponding standalone vowels for length calculations
  const MATRA_TO_VOWEL = {
    'ा': 'आ', 'ि': 'इ', 'ी': 'ई', 'ु': 'उ', 'ू': 'ऊ', 'ृ': 'ऋ', 'ॄ': 'ॠ', 'ॢ': 'ऌ', 'ॣ': 'ॡ',
    'े': 'ए', 'ै': 'ऐ', 'ो': 'ओ', 'ौ': 'औ', 'ॅ': 'ए', 'ॉ': 'ओ'
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    if (token.type === 'whitespace' || token.type === 'punctuation') {
      // If we have trailing consonants with no vowel before a space/boundary, 
      // attach them to the last syllable's trailing group
      if (currentOnset.length > 0 && syllables.length > 0) {
        const last = syllables[syllables.length - 1];
        last.trailing = last.trailing ? [...last.trailing, ...currentOnset] : [...currentOnset];
        currentOnset = [];
      }
      continue;
    }
    
    if (token.type === 'consonant') {
      currentOnset.push(token.value);
    } else if (token.type === 'virama') {
      // Virama suppresses the implicit vowel of the last consonant
      // It remains part of the current consonant cluster (onset/trailing)
      currentOnset.push(token.value);
    } else if (token.type === 'vowel' || token.type === 'matra') {
      // Determine actual vowel representation
      let nucleus = token.value;
      if (token.type === 'matra') {
        nucleus = MATRA_TO_VOWEL[token.value] || 'अ';
      }
      
      const syllable = {
        onset: [...currentOnset],
        nucleus: nucleus,
        coda: null,
        trailing: [],
        text: currentOnset.join('') + token.value
      };
      
      syllables.push(syllable);
      currentOnset = []; // Reset buffer
    } else if (token.type === 'anusvara' || token.type === 'visarga') {
      if (syllables.length > 0) {
        const last = syllables[syllables.length - 1];
        last.coda = token.value;
        last.text += token.value;
      }
    }
  }
  
  // Attach remaining trailing consonants to the final syllable
  if (currentOnset.length > 0 && syllables.length > 0) {
    const last = syllables[syllables.length - 1];
    last.trailing = last.trailing ? [...last.trailing, ...currentOnset] : [...currentOnset];
    last.text += currentOnset.join('');
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
  
  // 1. Check for Anuṣṭubh (Śloka) — 8 syllables per pada with specific constraints
  if (len === 8) {
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
  }
  
  // 2. Exact/Similarity template matching
  let bestMatch = null;
  let bestScore = 0;
  
  for (const meter of METERS) {
    if (Math.abs(meter.syllables - len) <= 1) {
      let score = 0;
      // Match up to the length of whichever is shorter
      const compareLen = Math.min(meter.pattern.length, len);
      for (let j = 0; j < compareLen; j++) {
        // Final syllable can be any weight (pādānte guruḥ / anceps)
        if (j === compareLen - 1 || meter.pattern[j] === pattern[j]) {
          score++;
        }
      }
      
      const confidence = score / compareLen;
      if (confidence > bestScore && confidence >= 0.8) {
        bestScore = confidence;
        bestMatch = { name: meter.name, confidence: confidence };
      }
    }
  }
  
  if (bestMatch) return bestMatch;
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
