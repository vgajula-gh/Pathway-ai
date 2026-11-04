import {api} from '../../lib/api';
import {useLoad} from '../ui';
import type {GrowthMapData} from './types';
export default function GrowthMapEntry({onOpen}:{onOpen:()=>void}) {
  const {data,error}=useLoad(()=>api<GrowthMapData>('/api/growth-map'),[]);
  const top=data?.skills.filter(s=>s.count>0).slice().sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)).slice(0,3);
  return <section className="sec"><div className="card growth-entry"><p className="label">PRIVATE TO YOU</p><h2>Your Growth Map</h2><p className="muted small">{top?.length?top.map(s=>`${s.name} · ${s.count} evidence`).join(' / '):error?'Growth Map is temporarily unavailable. Your other features are ready.':'See how your experiences connect to the skills you are building.'}</p><button className="btn fill" onClick={onOpen}>Open Growth Map</button></div></section>;
}
