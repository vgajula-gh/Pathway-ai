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
  return !deadlineExpired(o.deadline,today);
}
/** Stored deadlines are source-checked dates. Missing/invalid dates mean unknown,
 * never expired. Other details inform warnings/ranking, not result admission. */
export function deadlineExpired(deadline:string|null|undefined,today:string) {
  if(!deadline||!/^\d{4}-\d{2}-\d{2}$/.test(deadline))return false;
  const date=new Date(deadline+'T12:00:00Z');
  return Number.isFinite(+date)&&date.toISOString().slice(0,10)===deadline&&deadline<today;
}
export function explicitApplicationStatus(value:string,quote:string) {
  if(value==='closed')return !/not closed|still open/i.test(quote)&&/\b(closed|not open|no longer accepting|applications? (?:have )?ended)\b/i.test(quote);
  if(/\b(closed|not open|not (?:currently )?accepting|no longer accepting|will open|opening on|opens on)\b/i.test(quote))return false;
  if(value==='rolling')return /\brolling\s+(admissions?|applications?|enrol(?:l)?ment)\b|\b(applications?|sign[ -]?ups?)\b.{0,50}\b(rolling basis|year.round|ongoing)\b/i.test(quote);
  return value==='open'&&(/\b(applications?|registration|enrol(?:l)?ment|sign[ -]?ups?|membership)\s+(?:(?:are|is)\s+(?:(?:now|currently)\s+)?open|(?:now|currently)\s+open)\b/i.test(quote)||/\b(apply|register|sign up|join)\s+(now|today)\b|\bopen for (applications|registration|sign[ -]?ups)\b|\b(?:currently |now |we are )?accepting (?:applications?|registrations?)\b|\bapplications? open(?: (?:now|today))?(?=[.!?;:]|$)/i.test(quote));
}
