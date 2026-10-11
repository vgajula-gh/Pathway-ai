import { ReactNode, useEffect, useState, useCallback } from 'react';

export function Ring({ pct, color, size = 100, width = 7, children }: { pct: number; color: string; size?: number; width?: number; children?: ReactNode }) {
  const r = (size - width) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0.001, Math.min(1, pct || 0)));
  return (
    <span className="ringbox" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={width} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={width} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <span className="v">{children}</span>
    </span>
  );
}

export function Sheet({ title, onClose, left, right, children }: { title?: string; onClose: () => void; left?: ReactNode; right?: ReactNode; children: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  return (
    <div id="sheet" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet anim" role="dialog" aria-modal="true" aria-label={title || 'Details'}>
        <div className="grab" />
        <div className="sh-h"><div className="sh-l">{left}</div><div className="sh-t">{title}</div><div className="sh-r">{right ?? <button className="navbtn strong" onClick={onClose}>Done</button>}</div></div>
        <div className="sh-b">{children}</div>
      </div>
    </div>
  );
}

export const Typing = () => <span className="typing" aria-label="Working"><i /><i /><i /></span>;

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => { fn().then(d => { setData(d); setError(null); }).catch(e => setError(e.message)); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(reload, [reload]);
  return { data, error, reload, setData };
}

let toastTimer: number | undefined;
export function toast(msg: string) {
  let el = document.getElementById('toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el!.classList.remove('on'), 2400);
}
