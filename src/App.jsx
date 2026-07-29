import React, { useState, useEffect, useRef } from 'react';

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
  const [currentAudio, setCurrentAudio] = useState(null); // { id, text, blob, url }
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioProgress, setAudioProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const audioRef = useRef(null);

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

  const handleRecite = async () => {
    if (!text.trim()) return;
    setIsLoading(true);
    setErrorMsg('');

    try {
      const response = await fetch('/api/recite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: text.trim() })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate recitation.");
      }

      // Read audio binary data
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Create history item
      const newItem = {
        id: Date.now(),
        text: text.trim(),
        audioBlob: blob,
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
              {remainingTries === 0 ? (
                <span style={{ color: 'var(--color-danger)' }}>No remaining recitations this session</span>
              ) : (
                `${remainingTries} of 5 recitations remaining`
              )}
            </span>

            {/* Recite Action Button */}
            <button
              onClick={handleRecite}
              disabled={isLoading || !text.trim() || remainingTries <= 0}
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
                opacity: (isLoading || !text.trim() || remainingTries <= 0) ? 0.4 : 1,
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
              <span style={{
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: 'var(--color-text-secondary)',
                fontWeight: '500'
              }}>Now Playing</span>
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
              {/* Play Pause Trigger */}
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
                  /* Pause Icon */
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="4" height="16" />
                    <rect x="16" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  /* Play Icon */
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Progress Bar */}
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

              {/* Direct Download */}
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
                      <p style={{
                        fontFamily: 'var(--font-serif)',
                        fontSize: '15px',
                        color: 'var(--color-text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>{item.text}</p>
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
