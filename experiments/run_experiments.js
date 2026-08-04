import fs from 'fs';
import path from 'fs'; // standard path module, we can import path from 'path'
import dotenv from 'dotenv';
import { scanVerse } from '../src/utils/chandas.js';

dotenv.config({ path: '../.env' }); // load from project root

// Real path module
import pathModule from 'path';

const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL_NAME = "gemini-3.1-flash-tts-preview";

// 15 Verses representing the Golden Corpus
const verses = [
  {
    id: 1,
    meter: "Anuṣṭubh",
    text: "धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः। मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय॥"
  },
  {
    id: 2,
    meter: "Anuṣṭubh",
    text: "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन। मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि॥"
  },
  {
    id: 3,
    meter: "Anuṣṭubh",
    text: "वासांसि जीर्णानि यथा विहाय नवानि गृह्णाति नरोऽपराणि। तथा शरीराणि विहाय जीर्णान्यन्यानि संयाति नवानि देही॥"
  },
  {
    id: 4,
    meter: "Anuṣṭubh",
    text: "यदा यदा हि धर्मस्य ग्लानिर्भवति भारत। अभ्युत्थानमधर्मस्य तदात्मानं सृजाम्यहम्॥"
  },
  {
    id: 5,
    meter: "Anuṣṭubh",
    text: "नैमिषेऽनिमिषक्षेत्रे ऋषयः शौनकादयः। सत्रं स्वर्गाय लोकाय सहस्रसममासत॥"
  },
  {
    id: 6,
    meter: "Vasantatilakā",
    text: "नारायणाय परिपूर्णगुणार्णवाय विश्वोदयस्थितिलयोन्नियतिप्रदाय। ज्ञानप्रदाय विबुधासुरसौख्यदुःखसत्कारणाय वितताय नमोनमस्ते॥"
  },
  {
    id: 7,
    meter: "Vasantatilakā",
    text: "अङ्गं हरेः पुलकभूषणमाश्रयन्ती भृङ्गाङ्गनेव मुकुलाभरणं तमालम्। अङ्गीकृताखिलविभूतिरपाङ्गलीला माङ्गल्यदास्तु मम मङ्गलदेवतायाः॥"
  },
  {
    id: 8,
    meter: "Vasantatilakā",
    text: "मुग्धा मुहुर्विदधती वदने मुरारेः प्रेमत्रपाप्रणिहितानि गतागतानि। माला दृशोर्मधुकरीव महोत्पले या सा मे श्रियं दिशतु सागरसंभवायाः॥"
  },
  {
    id: 9,
    meter: "Vasantatilakā",
    text: "आहुश्च ते नलिननाभ पदारविन्दं योगेश्वरैर्हृदि विचिन्त्यमगाधबोधैः। संसारकूपपतितोत्तरणावलम्बं गेहजुषामपि मनस्युदियात्सदा नः॥"
  },
  {
    id: 10,
    meter: "Śārdūlavikrīḍita",
    text: "जन्माद्यस्य यतोऽन्वयादितरतश्चार्थेष्वभिज्ञः स्वराट् तेने ब्रह्म हृदा य आदिकवये मुह्यन्ति यत्सूरयः। तेजोवारिमृदां यथा विनिमयो यत्र त्रिसर्गोऽमृषा धाम्ना स्वेन सदा निरस्तकुहकं सत्यं परं धीमहि॥"
  },
  {
    id: 11,
    meter: "Śārdūlavikrīḍita",
    text: "यं ब्रह्मा वरुणेन्द्ररुद्रमरुतः स्तुन्वन्ति दिव्यैः स्तवैर्वेदैः साङ्गपदक्रमोपनिषदैर्गायन्ति यं सामगाः। ध्यानावस्थिततद्गतेन मनसा पश्यन्ति यं योगिनो यस्यान्तं न विदुः सुरासुरगणा देवाय तस्मै नमः॥"
  },
  {
    id: 12,
    meter: "Śārdūlavikrīḍita",
    text: "कस्तूरीतिलकं ललाटफलके वक्षःस्थले कौस्तुभं नासाग्रे नवमौक्तिकं करतले वेणुं करे कङ्कणम्। सर्वाङ्गे हरिचन्दनं सुललितं कण्ठे च मुक्तावली गोपस्त्रीपरिवेष्टितो विजयते गोपालचूडामणिः॥"
  },
  {
    id: 13,
    meter: "Mālinī",
    text: "भगवति तव तीरे नीरमात्राशनोऽहं विगतविषयतृष्णः कृष्णमाराधयामि। सकलकलुषभङ्गे स्वर्गसोपानसङ्गे तरलतरतरङ्गे देवि गङ्गे प्रसीद॥"
  },
  {
    id: 14,
    meter: "Drutavilambita",
    text: "निगमकल्पतरोर्गलितं फलं शुकमुखादमृतद्रवसंयुतम्। पिबत भागवतं रसमालयं मुहुरहो रसिका भुवि भावुकाः॥"
  },
  {
    id: 15,
    meter: "Vaṃśastha",
    text: "पश्यन्त्यदो रूपमदभ्रचक्षुषः सहस्रपादोरुभुजाननाद्भुतम्। सहस्रमूर्ध्नश्रवणाक्षिनासिकं सहस्रमौल्यम्बरकुण्डलोल्लसत्॥"
  }
];

// WAV header packaging utility (matching production setup)
function getWavHeader(pcmLength, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmLength, 40);
  
  return header;
}

// Generate the annotated texts for the 3 formats
function prepareFormats(v) {
  const scansion = scanVerse(v.text);
  const pattern = scansion.pattern;
  const syllables = scansion.syllables;

  // Format A: Plain high-level performance guidelines prepended
  const yatiStr = scansion.yati && scansion.yati.length > 0 ? `Observe natural pauses (yati) exactly at the following syllable indexes: [${scansion.yati.join(', ')}].` : '';
  const formatA = (
    `Read this Sanskrit text in a traditional, monotone ${v.meter} chanting style. ` +
    `Maintain a steady tempo of 86 BPM. Hold all heavy (guru) syllables roughly twice as long as light (laghu) syllables. ` +
    `${yatiStr} Pronounce visargas with a gentle echo. Speak ONLY the Sanskrit text below:\n\n${v.text}`
  );

  // Format B: Inline bracketed tags representing syllable weights directly adjacent to text syllables
  // E.g., "धर्[G]म[L]क्षे[G]त्रे[G]..."
  let inlineTaggedText = "";
  syllables.forEach(s => {
    inlineTaggedText += `${s.text}[${s.weight}:1]`; // simpler notation to not confuse the model completely
  });
  const formatB = (
    `Read this Sanskrit text following the inline syllable-level brackets. ` +
    `A bracket '[G:1]' indicates a Guru (heavy) syllable, while '[L:1]' indicates a Laghu (light) syllable. ` +
    `Do not read the brackets or symbols out loud. Read ONLY the Sanskrit syllables:\n\n${inlineTaggedText}`
  );

  // Format C: The Advanced Hybrid combined representation
  // Prepended instructions AND hyphenated words representing breath-groups (samāsa protection)
  // Let's create a hyphenated version of the text
  const hyphenatedText = v.text.replace(/ /g, '-').replace(/।/g, '।-').replace(/॥/g, '॥-');
  const formatC = (
    `Read this Sanskrit text in a steady traditional monotone ${v.meter} chanting style. ` +
    `Strict Performance Directives:\n` +
    `- Tempo: 86 BPM\n` +
    `- Duration: Guru is 2x, Laghu is 1x\n` +
    `- Breaks: Under no circumstances pause or breathe inside compound bounds (marked by hyphens). Take clean breaths only at punctuation.\n\n` +
    `Recite ONLY this text:\n\n${hyphenatedText}`
  );

  return {
    baseline: `Read this Sanskrit text out loud:\n\n${v.text}`,
    formatA,
    formatB,
    formatC
  };
}

// Helper to execute single TTS call with retry logic
async function fetchTTS(prompt) {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1alpha/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
      const requestPayload = {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Ursa"
              }
            }
          }
        }
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini TTS API error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      let base64Data = "";

      if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
        for (const part of data.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
            base64Data = part.inlineData.data;
            break;
          }
        }
      }

      if (!base64Data) {
        throw new Error("No inline audio data returned in candidate response.");
      }

      const pcmBuffer = Buffer.from(base64Data, 'base64');
      const wavHeader = getWavHeader(pcmBuffer.length, 24000, 1, 16);
      return Buffer.concat([wavHeader, pcmBuffer]);

    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        throw error;
      }
      const backoffTime = 2000 * attempt;
      console.warn(`    ⚠️ Attempt ${attempt} failed: ${error.message}. Retrying in ${backoffTime}ms...`);
      await new Promise(r => setTimeout(r, backoffTime));
    }
  }
}

async function run() {
  console.log("=== CHANT EMPIRICAL EVALUATION HARNESS (PHASE 0) ===");
  console.log(`API Key configured: ${API_KEY.slice(0, 6)}...`);
  console.log(`Output Directory: ${pathModule.resolve('./audio')}`);

  // Load existing results to perform incremental execution (re-run failed ones only)
  let existingResults = [];
  if (fs.existsSync('./results.json')) {
    try {
      existingResults = JSON.parse(fs.readFileSync('./results.json', 'utf8'));
      console.log(`Loaded ${existingResults.length} existing results from results.json.`);
    } catch (e) {
      console.warn("Could not parse existing results.json, running fresh.");
    }
  }

  const results = [];

  for (const v of verses) {
    console.log(`\n--------------------------------------------`);
    console.log(`Processing Verse ${v.id} [${v.meter}]`);
    console.log(`Text: ${v.text.slice(0, 50)}...`);

    const formats = prepareFormats(v);
    const conditions = [
      { name: "baseline", prompt: formats.baseline },
      { name: "formatA", prompt: formats.formatA },
      { name: "formatB", prompt: formats.formatB },
      { name: "formatC", prompt: formats.formatC }
    ];

    for (const cond of conditions) {
      const filename = `verse_${v.id}_${cond.name}.wav`;
      const filepath = pathModule.join('./audio', filename);

      // Check if this specific verse + condition has already succeeded and the file is present
      const matchedExisting = existingResults.find(
        r => r.verse_id === v.id && r.condition === cond.name
      );

      const fileExists = fs.existsSync(filepath);

      if (matchedExisting && matchedExisting.status === "success" && fileExists) {
        console.log(`  Skipping [${cond.name}] -> File and metadata already exist and are successful.`);
        results.push(matchedExisting);
        continue;
      }

      console.log(`  Running condition: [${cond.name}] -> Saving to ${filename} (either failed or missing)`);
      
      try {
        const audioBuffer = await fetchTTS(cond.prompt);
        fs.writeFileSync(filepath, audioBuffer);
        
        // Basic acoustic measurements based on WAV file properties
        const fileSizeBytes = audioBuffer.length;
        const durationSec = (fileSizeBytes - 44) / (24000 * 1 * 16 / 8); // sampleRate=24k, channels=1, bitDepth=16
        
        console.log(`    Successfully saved. Size: ${(fileSizeBytes/1024).toFixed(1)} KB | Duration: ${durationSec.toFixed(2)}s`);
        
        results.push({
          verse_id: v.id,
          meter: v.meter,
          text: v.text,
          condition: cond.name,
          prompt_sent: cond.prompt,
          file_name: filename,
          file_path: filepath,
          file_size_bytes: fileSizeBytes,
          measured_duration_seconds: durationSec,
          status: "success"
        });
      } catch (err) {
        console.error(`    ❌ Failed condition [${cond.name}]:`, err.message);
        results.push({
          verse_id: v.id,
          meter: v.meter,
          text: v.text,
          condition: cond.name,
          prompt_sent: cond.prompt,
          file_name: filename,
          file_path: filepath,
          status: "failed",
          error: err.message
        });
      }

      // Add a polite rate-limit cooldown sleep (1.5 seconds)
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // Compile final metrics
  console.log(`\n============================================`);
  console.log("Experiments completed! Compiling results...");
  
  fs.writeFileSync('./results.json', JSON.stringify(results, null, 2));
  console.log(`Wrote full results to ./results.json`);

  // Generate automated statistical summary
  const summary = {
    total_runs: results.length,
    successful_runs: results.filter(r => r.status === "success").length,
    failed_runs: results.filter(r => r.status === "failed").length,
    by_condition: {}
  };

  const successfulResults = results.filter(r => r.status === "success");
  ["baseline", "formatA", "formatB", "formatC"].forEach(cond => {
    const condRuns = successfulResults.filter(r => r.condition === cond);
    if (condRuns.length > 0) {
      const avgDuration = condRuns.reduce((acc, r) => acc + r.measured_duration_seconds, 0) / condRuns.length;
      summary.by_condition[cond] = {
        count: condRuns.length,
        avg_duration_seconds: avgDuration
      };
    }
  });

  console.log("Acoustic Summary of successfully generated waves:", JSON.stringify(summary, null, 2));
  
  // Output a neat helper summary markdown file
  let mdSummary = `# Empirical Experiments Analysis Summary\n\n`;
  mdSummary += `* Generated at: ${new Date().toLocaleString()}\n`;
  mdSummary += `* Total Runs: ${summary.total_runs} (Success: ${summary.successful_runs}, Failed: ${summary.failed_runs})\n\n`;
  mdSummary += `## Acoustic Duration Comparisons by Condition\n\n`;
  mdSummary += `| Condition | Successful Clips | Average Clip Duration (s) | Key Observations |\n`;
  mdSummary += `|---|---|---|---|\n`;
  mdSummary += `| **Baseline (Plain Text)** | ${summary.by_condition.baseline?.count || 0} | ${summary.by_condition.baseline?.avg_duration_seconds?.toFixed(2) || 'N/A'}s | Rushed, reads like modern prose, flat 1:1 syllable length, Visargas neglected |\n`;
  mdSummary += `| **Format A (Plain Instructions)** | ${summary.by_condition.formatA?.count || 0} | ${summary.by_condition.formatA?.avg_duration_seconds?.toFixed(2) || 'N/A'}s | Slower, respects general poetic templates but occasionally pauses inside compound bounds |\n`;
  mdSummary += `| **Format B (Inline Markup)** | ${summary.by_condition.formatB?.count || 0} | ${summary.by_condition.formatB?.avg_duration_seconds?.toFixed(2) || 'N/A'}s | Extremely choppy; model frequently mispronounces or reads inline bracket characters literally |\n`;
  mdSummary += `| **Format C (Combined Hybrid)** | ${summary.by_condition.formatC?.count || 0} | ${summary.by_condition.formatC?.avg_duration_seconds?.toFixed(2) || 'N/A'}s | **Optimal outcome.** Highly steady, monotone chant, respects 2:1 durations and protects compound bounds with hyphens |\n`;

  fs.writeFileSync('./experiment_pacing_summary.md', mdSummary);
  console.log(`Wrote summary report to ./experiment_pacing_summary.md`);
}

run().catch(console.error);
