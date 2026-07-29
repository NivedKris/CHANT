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
    const prompt = `Read this Sanskrit text in a steady, solemn, traditional chanting style with clear Vedic pause and accurate nasalization (Anusvāra). Do not speak any introduction, greeting, explanation, translation, or concluding remarks. Recite ONLY the Sanskrit text itself:\n\n${cleanText}`;

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
