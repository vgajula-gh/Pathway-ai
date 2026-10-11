import { useEffect, useRef, useState } from 'react';

interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

/** Only browser speech APIs: no audio capture, upload, or storage. */
export function useBuddyVoice(enabled: boolean, setText: (text: string) => void) {
  const Recognition = (window as VoiceWindow).SpeechRecognition || (window as VoiceWindow).webkitSpeechRecognition;
  const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const [listening, setListening] = useState(false), [speaking, setSpeaking] = useState(false), [readAloud, setReadAloud] = useState(false);
  const [error, setError] = useState('');
  const recognition = useRef<Recognition | null>(null), utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const alive = useRef(true), allowed = useRef(enabled), read = useRef(readAloud);
  allowed.current = enabled; read.current = readAloud;
  const stopSpeaking = () => {
    if (utterance.current) {
      utterance.current.onend = null; utterance.current.onerror = null;
      utterance.current = null; window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  };
  const cancelListening = () => {
    const r = recognition.current;
    recognition.current = null;
    if (r) { r.onresult = null; r.onend = null; r.onerror = null; r.abort(); }
    setListening(false);
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const r = recognition.current;
      if (r) { r.onresult = null; r.onend = null; r.onerror = null; r.abort(); recognition.current = null; }
      if (utterance.current) { utterance.current.onend = null; utterance.current.onerror = null; utterance.current = null; window.speechSynthesis.cancel(); }
    };
  }, []);
  useEffect(() => { if (!enabled) { cancelListening(); stopSpeaking(); setReadAloud(false); } }, [enabled]);
  const startListening = (draft: string) => {
    if (!allowed.current || !Recognition || recognition.current) return;
    stopSpeaking(); setError('');
    const r = new Recognition();
    r.continuous = true; r.interimResults = true; r.lang = navigator.language || 'en-US';
    r.onresult = event => {
      if (recognition.current !== r || !allowed.current) return;
      const transcript = Array.from(event.results, result => result[0].transcript).join(' ');
      setText([draft.trimEnd(), transcript].filter(Boolean).join(' '));
    };
    r.onend = () => { if (recognition.current === r) { recognition.current = null; setListening(false); } };
    r.onerror = event => {
      if (recognition.current !== r) return;
      setError(event.error === 'not-allowed' ? 'Microphone access was denied. You can still type your message.' : 'Voice input stopped. Check your message or try again.');
      cancelListening();
    };
    recognition.current = r;
    try { r.start(); setListening(true); } catch { cancelListening(); setError('Voice input could not start. You can still type your message.'); }
  };
  const stopListening = () => {
    try { recognition.current?.stop(); } catch { cancelListening(); }
  };
  const speakReply = (text: string) => {
    if (!alive.current || !allowed.current || !read.current || !canSpeak || !text.trim()) return;
    stopSpeaking();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = navigator.language || 'en-US';
    u.onend = () => { if (utterance.current === u) { utterance.current = null; setSpeaking(false); } };
    u.onerror = () => { if (utterance.current === u) { utterance.current = null; setSpeaking(false); setError('Could not read this reply aloud. You can still read it here.'); } };
    utterance.current = u; setSpeaking(true);
    try { window.speechSynthesis.speak(u); } catch { stopSpeaking(); setError('Could not read this reply aloud.'); }
  };
  const toggleReadAloud = (value: boolean) => { read.current = value; setReadAloud(value); if (!value) stopSpeaking(); };
  return { canRecognize: !!Recognition, canSpeak, listening, speaking, readAloud, error, startListening, stopListening, cancelListening, stopSpeaking, speakReply, toggleReadAloud };
}
