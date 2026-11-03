export type ActiveOpportunity = {
  category:string; name:string; opportunityType?:string; verificationStatus?:string;
  sourceCheckedAt?:Date|null; verifiedAt?:Date|null; deadline?:string|null;
  applicationStatus?:string; applicationStatusCheckedAt?:Date|null; activityDate?:string|null;
  evidence?:string;
  sourceReadAt?:Date|null;promptVersion?:string;
};
export function opportunityKind(category:string,name='',description='') {
  const text=category+' '+name+' '+description;
  if(/\b(competition|contest|challenge|hackathon|olympiad|awards?)\b/i.test(text))return 'competition';
  if(/\b(volunteer|volunteering|service project)\b/i.test(text))return 'volunteering';
  if(/\b(club|membership|chapter)\b/i.test(text))return 'club';
  if(/\b(internship|internships)\b/i.test(text))return 'internship';
  if(/\bscholarships?\b/i.test(text))return 'scholarship';
  return 'program';
}
export function activeOpportunity(o:ActiveOpportunity,today:string,now=new Date()) {
  const checked=o.verificationStatus==='verified'&&o.verifiedAt?o.sourceCheckedAt:
    o.verificationStatus==='needs_verification'&&o.promptVersion==='scout-v1'?o.sourceReadAt:null;
  if(!checked)return false;
  if(+now-+checked>30*86400000||+checked>+now+60000)return false;
  if(o.applicationStatus==='closed'||(o.deadline&&o.deadline<today))return false;
  let evidence:Record<string,{sourceUrl?:string;quote?:string}>={};
  try{evidence=JSON.parse(o.evidence||'{}');}catch{return false;}
  const proven=(field:string)=>{const fact=evidence[field];try{return !!fact?.quote&&new URL(fact.sourceUrl||'').protocol==='https:';}catch{return false;}};
  if(o.verificationStatus==='needs_verification'&&!proven('name'))return false;
  const inferred=opportunityKind(o.category,o.name),kind=inferred==='competition'?'competition':o.opportunityType||inferred;
  const future=!!o.deadline&&o.deadline>today&&proven('deadline');
  if(kind==='competition')return future;
  const open=['open','rolling'].includes(o.applicationStatus||'')&&!!o.applicationStatusCheckedAt&&+now-+o.applicationStatusCheckedAt<=30*86400000&&proven('applicationStatus')&&explicitApplicationStatus(o.applicationStatus!,evidence.applicationStatus.quote!);
  if(kind==='club'||kind==='volunteering')return open||!!o.activityDate&&o.activityDate>=today&&proven('activityDate');
  return open||future;
}
export function explicitApplicationStatus(value:string,quote:string) {
  if(value==='closed')return !/not closed|still open/i.test(quote)&&/\b(closed|not open|no longer accepting|applications? (?:have )?ended)\b/i.test(quote);
  if(/\b(closed|not open|not (?:currently )?accepting|no longer accepting|will open|opening on|opens on)\b/i.test(quote))return false;
  if(value==='rolling')return /\brolling\s+(admissions?|applications?|enrol(?:l)?ment)\b|\b(applications?|sign[ -]?ups?)\b.{0,50}\b(rolling basis|year.round|ongoing)\b/i.test(quote);
  return value==='open'&&(/\b(applications?|registration|enrol(?:l)?ment|sign[ -]?ups?|membership)\s+(?:(?:are|is)\s+(?:(?:now|currently)\s+)?open|(?:now|currently)\s+open)\b/i.test(quote)||/\b(apply|register|sign up|join)\s+(now|today)\b|\bopen for (applications|registration|sign[ -]?ups)\b|\b(?:currently |now |we are )?accepting (?:applications?|registrations?)\b|\bapplications? open(?: (?:now|today))?(?=[.!?;:]|$)/i.test(quote));
}
