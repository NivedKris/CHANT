import React, { useState, useEffect, useRef } from 'react';
import { scanVerse } from './utils/chandas';

// Simple IndexedDB wrapper to store audio Blobs offline across browser restarts
const DB_NAME = 'ChantDB';
const STORE_NAME = 'audio_history';

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function saveHistoryItem(item) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("Failed to save to IndexedDB", err);
  }
}

async function getAllHistoryItems() {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = (e) => {
        const items = e.target.result || [];
        items.sort((a, b) => b.id - a.id);
        resolve(items);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("Failed to read from IndexedDB", err);
    return [];
  }
}

async function deleteHistoryItem(id) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("Failed to delete from IndexedDB", err);
  }
}

export default function App() {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [remainingTries, setRemainingTries] = useState(5);
  const [history, setHistory] = useState([]);
  const [currentAudio, setCurrentAudio] = useState(null); // { id, text, blob, url, meter, pattern, stylePrompt, segmentedText, disambiguationLog }
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioProgress, setAudioProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  // Customizable tempo state (defaults to standard 86 BPM)
  const [tempo, setTempo] = useState(86);

  // Local live scansion visualization
  const [scansion, setScansion] = useState(null);

  // Real-time terminal trace logging
  const [traceLogs, setTraceLogs] = useState([]);

  const audioRef = useRef(null);

  // Analyze text on change for live scansion preview
  useEffect(() => {
    if (text.trim()) {
      const scan = scanVerse(text);
      setScansion(scan);
    } else {
      setScansion(null);
    }
  }, [text]);

  // Load status and history on mount
  useEffect(() => {
    fetchStatus();
    loadHistory();
  }, []);

  // Update audio listeners when current audio changes
  useEffect(() => {
    if (!audioRef.current) return;

    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      setAudioProgress(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration || 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setAudioProgress(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentAudio]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setRemainingTries(data.remaining);
      }
    } catch (err) {
      console.error("Failed to fetch limit status", err);
    }
  };

  const loadHistory = async () => {
    const items = await getAllHistoryItems();
    setHistory(items);
  };

  const addTraceLog = (stage, message) => {
    setTraceLogs(prev => [...prev, { stage, message, time: new Date().toLocaleTimeString() }]);
  };

  const handleRecite = async () => {
    if (!text.trim()) return;
    setIsLoading(true);
    setErrorMsg('');
    setTraceLogs([]);

    const cleanText = text.trim();

    try {
      // Step 1: Local deterministic scansion
      addTraceLog("Stage 1 & 2: Local Syllabifier Core", "Scanning Devanagari Unicode glyphs and segmenting akṣaras locally...");
      const localScan = scanVerse(cleanText);
      addTraceLog("Stage 3: Local Metric Scansion", `Syllables: ${localScan.syllables.length} | Weights: ${localScan.pattern}`);

      let matchedMeterName = localScan.meter;
      let disambigLog = [];

      // Step 2: Trigger Meter Disambiguation Agent if needed
      if (localScan.meter.startsWith('Unknown') || localScan.confidence < 0.9) {
        addTraceLog("Stage 3a: Disambiguation Agent", "Initiating fallback Meter Disambiguation LLM classifier...");
        try {
          const candidates = ['Anuṣṭubh (Śloka)', 'Indravajrā', 'Upendravajrā', 'Vasantatilakā', 'Mandākrāntā', 'Śārdūlavikrīḍita', 'Sragdharā', 'Mālinī', 'Śikhariṇī'];
          const disRes = await fetch('/api/disambiguate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pattern: localScan.pattern, len: localScan.syllables.length, candidates })
          });
          if (disRes.ok) {
            const disData = await disRes.json();
            if (disData.chosen_meter && disData.chosen_meter !== 'Unknown') {
              matchedMeterName = disData.chosen_meter;
              disambigLog.push({
                stage: 'Stage 3a (Meter Disambiguation)',
                decision: matchedMeterName,
                rationale: disData.rationale
              });
              addTraceLog("Stage 3a: Disambiguation Complete", `Resolved irregular structure ➔ ${matchedMeterName}. Rationale: ${disData.rationale}`);
            }
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        addTraceLog("Stage 3: Metric Scansion Complete", `Matched direct samavṛtta template ➔ ${matchedMeterName}`);
      }

      // Step 3: Trigger Compound Word Boundary Splitter Agent
      addTraceLog("Stage 5: Compound Splitter Agent", "Analyzing text for compound word boundary (samāsa) constraints...");
      let segmentedText = cleanText;
      try {
        const segRes = await fetch('/api/compounds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanText })
        });
        if (segRes.ok) {
          const segData = await segRes.json();
          if (segData.segmented_text) {
            segmentedText = segData.segmented_text;
            addTraceLog("Stage 5: Segmentation Complete", `Found compound segments: ${JSON.stringify(segData.compounds_found)}`);
          }
        }
      } catch (e) {
        console.error(e);
      }

      // Step 4: Trigger Prosody-to-Prompt Composer Agent
      addTraceLog("Stage 6: Prompt Composer Agent", "Composing optimal acoustic style parameters based on analyzed metrics...");
      const annotation = {
        original_text: cleanText,
        segmented_text: segmentedText,
        meter_name: matchedMeterName,
        syllable_count: localScan.syllables.length,
        weights: localScan.pattern,
        has_long_guru_runs: localScan.pattern.includes('GGGG'),
        estimated_duration_matras: localScan.syllables.reduce((acc, s) => acc + (s.weight === 'G' ? 2 : 1), 0),
        visarga_count: (cleanText.match(/ः/g) || []).length,
        tempo: tempo // Explicitly feed tempo parameter to the composer
      };

      let stylePrompt = "steady traditional chanting style.";
      try {
        const compRes = await fetch('/api/compose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ annotation })
        });
        if (compRes.ok) {
          const compData = await compRes.json();
          if (compData.style_prompt) {
            stylePrompt = compData.style_prompt;
            addTraceLog("Stage 6: Composition Complete", `Style prompt created ➔ "${stylePrompt}"`);
          }
        }
      } catch (e) {
        console.error(e);
      }

      // Step 5: Synthesize High-Fidelity Recitation audio (Stage 7)
      addTraceLog("Stage 7: TTS Synthesis Engine", "Synthesizing chanting audio over high-fidelity voice vectors...");
      const response = await fetch('/api/recite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: cleanText, tempo: tempo })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate recitation.");
      }

      const resData = await response.json();
      addTraceLog("Stage 7: Audio Complete", "Received high-fidelity WAV buffer.");

      // Convert base64 audio to binary Blob
      const binaryString = window.atob(resData.audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);

      // Create history item
      const newItem = {
        id: Date.now(),
        text: cleanText,
        audioBlob: blob,
        meter: matchedMeterName,
        pattern: localScan.pattern,
        stylePrompt: stylePrompt,
        segmentedText: segmentedText,
        disambiguationLog: disambigLog,
        date: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      };

      // Save to IndexedDB
      await saveHistoryItem(newItem);

      // Re-map items with local URLs for state
      const updatedItemForState = {
        ...newItem,
        audioUrl: url
      };

      setCurrentAudio(updatedItemForState);
      setIsPlaying(true);
      setText(''); // Clear input

      // Update remaining tries headers
      const triesHeader = response.headers.get('X-Remaining-Tries');
      if (triesHeader !== null) {
        setRemainingTries(parseInt(triesHeader, 10));
      } else {
        fetchStatus();
      }

      // Refresh history list
      loadHistory();

    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error("Audio playback failed", err);
      });
    }
  };

  const handleSeek = (e) => {
    if (!audioRef.current) return;
    const seekTime = parseFloat(e.target.value);
    audioRef.current.currentTime = seekTime;
    setAudioProgress(seekTime);
  };

  const playHistoryItem = (item) => {
    // If the item already has a local object URL in our current audio state, just toggle it
    if (currentAudio && currentAudio.id === item.id) {
      handlePlayPause();
      return;
    }

    // Revoke previous URL if any
    if (currentAudio && currentAudio.audioUrl) {
      URL.revokeObjectURL(currentAudio.audioUrl);
    }

    const url = URL.createObjectURL(item.audioBlob);
    const selected = {
      ...item,
      audioUrl: url
    };

    setCurrentAudio(selected);
    setIsPlaying(false);
    
    // Auto play once loaded
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(err => console.error(err));
      }
    }, 100);
  };

  const handleDeleteItem = async (id, e) => {
    e.stopPropagation();
    await deleteHistoryItem(id);
    
    // If deleted is the currently playing audio, clear it
    if (currentAudio && currentAudio.id === id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setCurrentAudio(null);
      setIsPlaying(false);
    }
    loadHistory();
  };

  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  return (
    <div style={{
      maxWidth: '640px',
      margin: '0 auto',
      padding: '40px 24px',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      gap: '40px'
    }}>
      {/* Hidden Audio Element */}
      {currentAudio && (
        <audio 
          ref={audioRef} 
          src={currentAudio.audioUrl} 
          preload="auto"
        />
      )}

      {/* Header */}
      <header style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '4px'
      }} className="animate-fade-in">
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          border: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '12px'
        }}>
          <svg width="24" height="24" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="48" stroke="var(--color-text)" strokeWidth="1.5"/>
            <circle cx="50" cy="50" r="36" stroke="var(--color-text)" strokeWidth="0.75" strokeDasharray="3 3"/>
            <circle cx="50" cy="50" r="10" stroke="var(--color-text)" strokeWidth="2"/>
          </svg>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '32px',
          fontWeight: '300',
          letterSpacing: '8px',
          textTransform: 'uppercase',
          paddingLeft: '8px' // offset centering for letter spacing
        }}>CHANT</h1>
        <p style={{
          color: 'var(--color-text-secondary)',
          fontSize: '12px',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          fontWeight: '400'
        }}>Sanskrit Recitation</p>
      </header>

      {/* Main Content Area */}
      <main style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
      }} className="animate-fade-in">
        
        {/* Text Input Block */}
        <div style={{
          backgroundColor: 'var(--color-secondary-bg)',
          borderRadius: '16px',
          border: '1px solid var(--color-border)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          transition: 'all 0.2s ease'
        }}>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            placeholder="enter sanskrit text (e.g., सत्यमेव जयते)"
            disabled={isLoading}
            style={{
              width: '100%',
              height: '110px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontFamily: 'var(--font-serif)',
              fontSize: '18px',
              lineHeight: '1.6',
              color: 'var(--color-text)',
            }}
          />

          {/* Live Scansion Visualization Block */}
          {scansion && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              backgroundColor: 'var(--color-bg)',
              borderRadius: '8px',
              padding: '12px 16px',
              border: '1px solid var(--color-border)',
              animation: 'fadeIn 0.2s ease'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: 'var(--color-text-secondary)',
                letterSpacing: '0.5px'
              }}>
                <span style={{ textTransform: 'uppercase', fontWeight: '500' }}>Live Meter Scan</span>
                <span style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-text)' }}>
                  {scansion.meter} {scansion.confidence ? `(${Math.round(scansion.confidence * 100)}% Match)` : ''}
                </span>
              </div>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                marginTop: '4px'
              }}>
                {scansion.syllables.map((s, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    minWidth: '24px',
                    gap: '2px'
                  }}>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: '600',
                      color: s.weight === 'G' ? 'var(--color-text)' : 'var(--color-text-secondary)'
                    }}>
                      {s.weight === 'G' ? '◌̄' : '◌̆'}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: '15px',
                      color: 'var(--color-text)'
                    }}>
                      {s.text}
                    </span>
                  </div>
                ))}
              </div>

              {/* Tempo Control Bar */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                borderTop: '1px solid var(--color-border)',
                paddingTop: '10px',
                marginTop: '4px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  color: 'var(--color-text-secondary)'
                }}>
                  <span style={{ textTransform: 'uppercase', fontWeight: '500' }}>Recitation Tempo (BPM)</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>{tempo} BPM</span>
                </div>
                <input
                  type="range"
                  min="55"
                  max="140"
                  value={tempo}
                  onChange={(e) => setTempo(parseInt(e.target.value, 10))}
                  style={{
                    width: '100%',
                    accentColor: 'var(--color-text)',
                    height: '3px',
                    cursor: 'pointer',
                    borderRadius: '2px',
                    marginTop: '2px'
                  }}
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div style={{
              color: 'var(--color-danger)',
              fontSize: '13px',
              fontFamily: 'var(--font-sans)',
              lineHeight: '1.4'
            }}>
              {errorMsg}
            </div>
          )}

          {/* Live Real-time Trace Log Visualization */}
          {isLoading && traceLogs.length > 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              backgroundColor: 'var(--color-bg)',
              borderRadius: '8px',
              padding: '12px 16px',
              border: '1px solid var(--color-border)',
              maxHeight: '160px',
              overflowY: 'auto'
            }}>
              <span style={{
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: 'var(--color-text-secondary)',
                fontWeight: '600'
              }}>Real-time Pipeline Tracking</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {traceLogs.map((log, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    lineHeight: '1.4'
                  }}>
                    <span style={{ color: 'var(--color-text)' }}>
                      <b style={{ color: 'var(--color-text-secondary)' }}>{log.stage}:</b> {log.message}
                    </span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--color-text-secondary)', marginLeft: '8px' }}>
                      {log.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid var(--color-border)',
            paddingTop: '16px'
          }}>
            {/* Session Indicator */}
            <span style={{
              fontSize: '12px',
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-sans)',
              letterSpacing: '0.5px'
            }}>
              {isDev ? (
                "Unlimited development recitations"
              ) : remainingTries === 0 ? (
                <span style={{ color: 'var(--color-danger)' }}>No remaining recitations this session</span>
              ) : (
                `${remainingTries} of 5 recitations remaining`
              )}
            </span>

            {/* Recite Action Button */}
            <button
              onClick={handleRecite}
              disabled={isLoading || !text.trim() || (!isDev && remainingTries <= 0)}
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-bg)',
                border: 'none',
                borderRadius: '24px',
                padding: '10px 24px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: (isLoading || !text.trim() || (!isDev && remainingTries <= 0)) ? 0.4 : 1,
                transition: 'opacity 0.2s ease, transform 0.1s ease',
              }}
            >
              {isLoading ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="animate-pulse-slow">
                    <circle cx="12" cy="12" r="10" strokeDasharray="30 30" />
                  </svg>
                  Reciting...
                </>
              ) : (
                'Recite'
              )}
            </button>
          </div>
        </div>

        {/* Custom Mini Player (Active Recitation) */}
        {currentAudio && (
          <div style={{
            backgroundColor: 'var(--color-bg)',
            borderRadius: '16px',
            border: '1px solid var(--color-border)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  color: 'var(--color-text-secondary)',
                  fontWeight: '500'
                }}>Now Playing</span>
                {currentAudio.meter && (
                  <span style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-serif)',
                    color: 'var(--color-text-secondary)'
                  }}>
                    {currentAudio.meter}
                  </span>
                )}
              </div>
              <p style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '16px',
                color: 'var(--color-text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>{currentAudio.text}</p>
            </div>

            {/* Custom Control Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}>
              {/* Play/Pause Button */}
              <button
                onClick={handlePlayPause}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-secondary-bg)',
                  transition: 'background-color 0.2s ease'
                }}
              >
                {isPlaying ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="4" height="16" />
                    <rect x="16" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Progress Slider */}
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <input
                  type="range"
                  min="0"
                  max={audioDuration || 100}
                  value={audioProgress}
                  onChange={handleSeek}
                  style={{
                    flex: 1,
                    accentColor: 'var(--color-text)',
                    height: '3px',
                    cursor: 'pointer',
                    borderRadius: '2px'
                  }}
                />
                <span style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: 'var(--color-text-secondary)',
                  minWidth: '70px',
                  textAlign: 'right'
                }}>
                  {formatTime(audioProgress)} / {formatTime(audioDuration)}
                </span>
              </div>

              {/* Download */}
              <a
                href={currentAudio.audioUrl}
                download={`chant-${currentAudio.id}.wav`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  color: 'var(--color-text)',
                  backgroundColor: 'var(--color-secondary-bg)',
                  textDecoration: 'none'
                }}
                title="Download recitation"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </a>
            </div>

            {/* Agentic Recitation Board */}
            {(currentAudio.stylePrompt || currentAudio.disambiguationLog?.length > 0 || currentAudio.segmentedText) && (
              <div style={{
                marginTop: '12px',
                paddingTop: '12px',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <span style={{
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  color: 'var(--color-text-secondary)',
                  fontWeight: '600'
                }}>Agentic Recitation Board</span>
                
                {currentAudio.segmentedText && currentAudio.segmentedText !== currentAudio.text && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Compound Segmentation:</span>
                    <p style={{ fontFamily: 'var(--font-serif)', fontSize: '14px', color: 'var(--color-text)' }}>
                      {currentAudio.segmentedText}
                    </p>
                  </div>
                )}

                {currentAudio.stylePrompt && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Composed Speech Guidelines:</span>
                    <p style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--color-text)', lineHeight: '1.4' }}>
                      "{currentAudio.stylePrompt}"
                    </p>
                  </div>
                )}

                {currentAudio.disambiguationLog && currentAudio.disambiguationLog.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Decision Trace:</span>
                    {currentAudio.disambiguationLog.map((logItem, idx) => (
                      <div key={idx} style={{
                        backgroundColor: 'var(--color-secondary-bg)',
                        borderRadius: '6px',
                        padding: '8px 10px',
                        fontSize: '11px',
                        border: '1px solid var(--color-border)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '600' }}>{logItem.stage}</span>
                          <span style={{ fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>➔ {logItem.decision}</span>
                        </div>
                        <p style={{ color: 'var(--color-text-secondary)', lineHeight: '1.3' }}>{logItem.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* History Area */}
        {history.length > 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            marginTop: '12px'
          }}>
            <h2 style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: 'var(--color-text-secondary)',
              fontWeight: '500',
              paddingLeft: '4px'
            }}>Previous Recitations</h2>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              {history.map((item) => {
                const isActive = currentAudio && currentAudio.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => playHistoryItem(item)}
                    style={{
                      backgroundColor: 'var(--color-secondary-bg)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '12px',
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      outline: isActive ? '1px solid var(--color-text)' : 'none'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      flex: 1,
                      marginRight: '16px',
                      overflow: 'hidden'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                        <p style={{
                          fontFamily: 'var(--font-serif)',
                          fontSize: '15px',
                          color: 'var(--color-text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>{item.text}</p>
                        {item.meter && (
                          <span style={{
                            fontSize: '10px',
                            fontFamily: 'var(--font-serif)',
                            color: 'var(--color-text-secondary)',
                            backgroundColor: 'var(--color-bg)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid var(--color-border)'
                          }}>
                            {item.meter}
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontSize: '10px',
                        color: 'var(--color-text-secondary)'
                      }}>{item.date}</span>
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      {/* Play/Pause state of history item */}
                      <button
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-text)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '28px',
                          height: '28px'
                        }}
                      >
                        {isActive && isPlaying ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="4" y="4" width="4" height="16" />
                            <rect x="16" y="4" width="4" height="16" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </button>

                      {/* Download */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const tempUrl = URL.createObjectURL(item.audioBlob);
                          const a = document.createElement('a');
                          a.href = tempUrl;
                          a.download = `chant-${item.id}.wav`;
                          a.click();
                          URL.revokeObjectURL(tempUrl);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '28px',
                          height: '28px'
                        }}
                        title="Download"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </button>

                      {/* Delete */}
                      <button
                        onClick={(e) => handleDeleteItem(item.id, e)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '28px',
                          height: '28px',
                          opacity: 0.6
                        }}
                        title="Delete from history"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        marginTop: 'auto',
        textAlign: 'center',
        paddingTop: '40px',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }} className="animate-fade-in">
        <span style={{
          fontSize: '11px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)'
        }}>CHANT • Sanskrit Recitation Portal</span>
        <span style={{
          fontSize: '9px',
          color: 'var(--color-text-secondary)',
          letterSpacing: '0.5px'
        }}>Powered by neural high-fidelity audio synthesis</span>
      </footer>
    </div>
  );
}
