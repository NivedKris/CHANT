import { ipUsage, MAX_TRIES } from './status.js';

const MODEL_NAME = "gemini-3.1-flash-tts-preview";

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY environment variable is not set." });
  }

  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: "Sanskrit text is required." });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const used = ipUsage.get(ip) || 0;

    if (used >= MAX_TRIES) {
      return res.status(429).json({ 
        error: "Session limit reached. You have completed your 5 allowed recitations for this session." 
      });
    }

    const cleanText = text.trim();
    
    const systemPrompt = `You are an expert Vedic and Classical Sanskrit chant reciter.

Your task is to faithfully vocalize the annotated Sanskrit text exactly as provided. The annotations have already been computed by an external deterministic prosody engine and are always correct. Never reinterpret, modify, or ignore them.

Follow these rules strictly:

• Pronounce every Devanagari character accurately using standard Classical Sanskrit pronunciation.
• Preserve all vowel lengths exactly.
• Do not modernize pronunciation or apply regional accents.
• Do not translate, explain, paraphrase, or spell out the text.
• Produce continuous melodic chanting rather than conversational speech.

Prosody Rules

• (G) = Guru (heavy syllable)
  - Sustain the vowel noticeably longer than adjacent Laghu syllables (approximately twice the duration, while remaining natural).
  - Do not add stress or emphasis; only increase duration.

• (L) = Laghu (light syllable)
  - Pronounce briefly and clearly.
  - Keep the rhythm even.

Pause Rules

• <PAUSE_MINOR>
  - Insert a short, smooth pause without breaking the rhythmic flow.

• <PAUSE_MAJOR>
  - Insert a longer pause marking the end of a pāda or verse segment.

Rhythm

• Maintain a steady chant throughout the verse.
• Preserve the rhythmic pattern implied by the Guru/Laghu sequence.
• Do not exaggerate syllable durations.
• Avoid dramatic expression, emotional acting, or theatrical narration.
• Maintain a calm, devotional, metrically regular delivery.

Input Format

The input will contain Devanagari text with inline annotations such as:

ना(G) रा(G) य(L) णा(G) य(G)
<PAUSE_MAJOR>
वि(L) श्वो(G) द(L) य(L)...

These annotations are authoritative. Your sole responsibility is to render them faithfully into natural, fluent Sanskrit chanting.`;

    const prompt = `${systemPrompt}\n\nInput:\n\n${cleanText}`;

    // Contact Gemini API
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
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("API error response:", errText);
      return res.status(502).json({ error: "Recitation service error. Please try again." });
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
      return res.status(500).json({ error: "No audio was generated for this text. Please check the text format." });
    }

    // Increment IP count on successful generation
    ipUsage.set(ip, used + 1);

    const pcmBuffer = Buffer.from(base64Data, 'base64');
    const wavHeader = getWavHeader(pcmBuffer.length, 24000, 1, 16);
    const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

    // Send the high-quality WAV audio stream
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', wavBuffer.length);
    res.setHeader('X-Remaining-Tries', String(MAX_TRIES - (used + 1)));
    return res.status(200).send(wavBuffer);

  } catch (error) {
    console.error("Recitation serverless handler error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
}
