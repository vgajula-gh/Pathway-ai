import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { useBuddyVoice } from '../../web/src/lib/useBuddyVoice';

class Recognition {
  static latest: Recognition;
  continuous = false; interimResults = false; lang = '';
  onresult: any; onend: any; onerror: any;
  start = vi.fn(); stop = vi.fn(); abort = vi.fn();
  constructor() { Recognition.latest = this; }
}
class Utterance { onend: any; onerror: any; lang = ''; constructor(public text: string) {} }
let renderer: ReactTestRenderer;
let voice: ReturnType<typeof useBuddyVoice>;
let draft: ReturnType<typeof vi.fn>;
let synthesis: { speak: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };
function Harness({ enabled }: { enabled: boolean }) { voice = useBuddyVoice(enabled, draft); return null; }
const mount = (enabled = true) => act(() => { renderer = create(createElement(Harness, { enabled })); });
beforeEach(() => {
  draft = vi.fn(); synthesis = { speak: vi.fn(), cancel: vi.fn() };
  vi.stubGlobal('window', { SpeechRecognition: Recognition, speechSynthesis: synthesis, SpeechSynthesisUtterance: Utterance });
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  vi.stubGlobal('navigator', { language: 'en-US' });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); vi.unstubAllGlobals(); });

describe('Buddy browser voice', () => {
  it('detects prefixed recognition and hides unsupported recognition', () => {
    (window as any).SpeechRecognition = undefined;
    (window as any).webkitSpeechRecognition = Recognition;
    mount(); expect(voice.canRecognize).toBe(true);
    (window as any).webkitSpeechRecognition = undefined;
    act(() => renderer.update(createElement(Harness, { enabled: true })));
    expect(voice.canRecognize).toBe(false);
  });
  it('does not start with Voice off', () => {
    mount(false); act(() => voice.startListening(''));
    expect(voice.listening).toBe(false); expect(draft).not.toHaveBeenCalled();
  });
  it('adds recognition results to a draft and replaces interim results without duplication', () => {
    mount(); act(() => voice.startListening('Existing draft'));
    const r = Recognition.latest;
    expect(voice.listening).toBe(true);
    act(() => r.onresult({ results: [[{ transcript: 'hello' }]] }));
    expect(draft).toHaveBeenLastCalledWith('Existing draft hello');
    act(() => r.onresult({ results: [[{ transcript: 'hello Buddy' }]] }));
    expect(draft).toHaveBeenLastCalledWith('Existing draft hello Buddy');
    act(() => voice.stopListening()); expect(r.stop).toHaveBeenCalledOnce();
    act(() => r.onend()); expect(voice.listening).toBe(false);
  });
  it('handles microphone denial and permits retry', () => {
    mount(); act(() => voice.startListening(''));
    act(() => Recognition.latest.onerror({ error: 'not-allowed' }));
    expect(voice.error).toContain('denied'); expect(voice.listening).toBe(false);
    act(() => voice.startListening('')); expect(voice.listening).toBe(true); expect(voice.error).toBe('');
  });
  it('reads replies only after opt-in, with stop and error handling', () => {
    mount(); act(() => voice.speakReply('Reply')); expect(synthesis.speak).not.toHaveBeenCalled();
    act(() => voice.toggleReadAloud(true)); act(() => voice.speakReply('Reply'));
    expect(synthesis.speak.mock.calls[0][0].text).toBe('Reply'); expect(voice.speaking).toBe(true);
    act(() => voice.stopSpeaking()); expect(synthesis.cancel).toHaveBeenCalledOnce(); expect(voice.speaking).toBe(false);
    act(() => voice.speakReply('Another reply'));
    act(() => synthesis.speak.mock.calls[1][0].onerror());
    expect(voice.speaking).toBe(false); expect(voice.error).toContain('Could not read');
  });
  it('aborts listening and cancels playback on disable and unmount', () => {
    mount(); act(() => voice.startListening(''));
    const r = Recognition.latest, lateResult = r.onresult;
    act(() => renderer.update(createElement(Harness, { enabled: false })));
    expect(r.abort).toHaveBeenCalledOnce(); expect(r.onresult).toBeNull();
    act(() => lateResult({ results: [[{ transcript: 'late' }]] })); expect(draft).not.toHaveBeenCalled();
    act(() => renderer.update(createElement(Harness, { enabled: true })));
    act(() => voice.toggleReadAloud(true)); act(() => voice.speakReply('Reply'));
    act(() => renderer.unmount()); expect(synthesis.cancel).toHaveBeenCalledOnce();
    act(() => voice.speakReply('Late reply')); expect(synthesis.speak).toHaveBeenCalledOnce();
  });
});
