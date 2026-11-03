import {useState} from 'react';
import {api} from '../lib/api';
import type {DiscoveryPreferences,Student} from '../lib/types';
import {Sheet} from './ui';
import RegionSelect from './RegionSelect';
const states='AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
const defaults:DiscoveryPreferences={city:'',state:'',radiusMiles:50,format:'both',goals:'',personalProject:'',hoursPerWeek:null,maxCost:null,currency:'USD'};
export default function DiscoveryPreferencesEditor({me,onSaved,onClose}:{me:Student;onSaved:(s:Student)=>void;onClose:()=>void}) {
  const [prefs,setPrefs]=useState({...defaults,...me.discoveryPreferences,format:me.format==='virtual'||me.region==='virtual'?'online' as const:me.discoveryPreferences?.format||'both'});
  const [interests,setInterests]=useState(me.interests.join(', ')),[region,setRegion]=useState(me.region||''),[budget,setBudget]=useState(me.budget);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const update=<K extends keyof DiscoveryPreferences>(key:K,value:DiscoveryPreferences[K])=>setPrefs(p=>({...p,[key]:value}));
  const numeric=(key:'maxCost'|'hoursPerWeek',value:string)=>update(key,value===''?null:Number(value));
  const save=async()=>{setBusy(true);setError('');try {
    const student=await api<Student>('/api/me',{method:'PATCH',body:{interests:[...new Set(interests.split(',').map(s=>s.trim()).filter(Boolean))],region:region==='virtual'&&prefs.format!=='online'?'':region,budget,format:prefs.format==='online'?'virtual':prefs.format==='in_person'?'in_person':'any',discoveryPreferences:prefs}});
    onSaved(student);onClose();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <Sheet title="Opportunity preferences" onClose={onClose}>
    <form onSubmit={e=>{e.preventDefault();void save();}} className="discovery-preferences">
      <p className="note">All extra details are optional. Saving updates your recommendations; it doesn’t start a web search or change your plan.</p>
      <label htmlFor="scout-interests">Interests, separated by commas</label><input id="scout-interests" className="field" value={interests} maxLength={760} onChange={e=>setInterests(e.target.value)}/>
      <RegionSelect value={region} onChange={v=>{setRegion(v);if(v==='virtual')update('format','online');}}/>
      <label htmlFor="scout-format">Participation</label><select id="scout-format" className="field" value={prefs.format} onChange={e=>update('format',e.target.value as DiscoveryPreferences['format'])}><option value="both">Online and in person</option><option value="online">Online only</option><option value="in_person">In person only</option></select>
      <label htmlFor="scout-city">City (optional, no street address)</label><input id="scout-city" className="field" autoComplete="address-level2" value={prefs.city} maxLength={80} onChange={e=>update('city',e.target.value)}/>
      <label htmlFor="scout-state">State (optional)</label><select id="scout-state" className="field" value={prefs.state} onChange={e=>update('state',e.target.value)}><option value="">Not set</option>{states.map(s=><option key={s}>{s}</option>)}</select>
      <label htmlFor="scout-radius">Approximate travel radius (miles)</label><input id="scout-radius" className="field" type="number" min={1} max={1000} value={prefs.radiusMiles} onChange={e=>update('radiusMiles',Number(e.target.value))}/>
      <p className="note">City distances are approximate. Missing locations stay unconfirmed. Online options don’t use this radius.</p>
      <label htmlFor="scout-goals">What would you like to get from an opportunity? (optional)</label><textarea id="scout-goals" className="field" value={prefs.goals} maxLength={1000} onChange={e=>update('goals',e.target.value)}/>
      <label htmlFor="scout-project">A project you’re working on (optional)</label><textarea id="scout-project" className="field" value={prefs.personalProject} maxLength={1500} onChange={e=>update('personalProject',e.target.value)}/>
      <p className="note">Goals, project text, time and maximum cost are used privately to choose your recommendations. Web search uses your interests, grade band and broad location/format.</p>
      <label htmlFor="scout-hours">Hours available each week (optional)</label><input id="scout-hours" className="field" type="number" min={0} max={168} step="0.5" value={prefs.hoursPerWeek??''} onChange={e=>numeric('hoursPerWeek',e.target.value)}/>
      <label htmlFor="scout-budget">Budget preference</label><select id="scout-budget" className="field" value={budget} onChange={e=>setBudget(e.target.value)}><option value="any">Show free and paid options</option><option value="free">Free first; keep paid options collapsed</option></select>
      <label htmlFor="scout-cost">Maximum program cost in USD (optional)</label><input id="scout-cost" className="field" type="number" min={0} max={100000} step="0.01" value={prefs.maxCost??''} onChange={e=>numeric('maxCost',e.target.value)}/>
      <p className="note">Programs above a confirmed minimum fee are filtered out. Unknown fees or extras are flagged for checking.</p>
      {error&&<p role="alert">{error}</p>}<button className="btn fill" type="submit" disabled={busy}>{busy?'Saving…':'Save preferences'}</button>
    </form>
  </Sheet>;
}
