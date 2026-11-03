/** Controlled verification details. Never put page text, URLs or model values here. */
export const verificationFields = ['name','organizer','officialDomain','gradeMin','gradeMax','gradeRange','format','deadline','applicationStatus','activityDate'] as const;
export const verificationReasons = ['not_stated','source_not_fetched','quote_not_found','value_not_supported','unreviewed_domain','invalid_grade_range','not_current','closed','past_deadline'] as const;
export type VerificationIssue = {field:typeof verificationFields[number];reason:typeof verificationReasons[number]};
export class OpportunityEvidenceError extends Error {
  constructor(public verification:VerificationIssue[],message='Program name or organizer lacks page evidence') {super(message);}
}

/** Numeric grades only: no age conversion, inferred high-school bounds or filled list gaps. */
export function gradeRangeInQuote(quote:string):{min:number;max:number}|null {
  const text=quote.normalize('NFKC'),matches:{min:number;max:number}[]=[],spans:{start:number;end:number}[]=[];
  let invalid=false;
  const add=(match:RegExpMatchArray,numbers:number[],range:boolean)=>{
    const start=match.index!,end=start+match[0].length;
    if(spans.some(m=>start<m.end&&end>m.start))return;
    spans.push({start,end});
    // A rising/entering grade does not establish the student's current grade.
    if(/\b(?:rising|entering|completed|finishing)\s*$/i.test(text.slice(Math.max(0,start-40),start))) {invalid=true;return;}
    if(numbers.some(n=>n<1||n>12)||new Set(numbers).size!==numbers.length) {invalid=true;return;}
    const min=numbers[0],max=numbers.at(-1)!;
    if(min>max||range&&numbers.length!==2||!range&&numbers.some((n,i)=>n!==min+i)) {invalid=true;return;}
    matches.push({min,max});
  };
  // A prefix supports a range, a single grade, or a contiguous enumerated list.
  for(const m of text.matchAll(/\bgrades?\s+(\d{1,2}(?:st|nd|rd|th)?(?:\s*(?:[-‐‑‒–—−]|\bto\b|\bthrough\b|,\s*(?:and\s+)?|\band\b|&)\s*\d{1,2}(?:st|nd|rd|th)?)*)\b/gi)) {
    const numbers=(m[1].match(/\d+/g)||[]).map(Number);
    add(m,numbers,/[-‐‑‒–—−]|\b(?:to|through)\b/i.test(m[1]));
  }
  // Ordinal suffixes distinguish grades from a count such as "12 students".
  for(const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:[-‐‑‒–—−]|through|to)\s*(\d{1,2})(?:st|nd|rd|th)\s+(?:grades?(?:\s+students?)?|graders)\b/gi))add(m,[Number(m[1]),Number(m[2])],true);
  for(const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)[ -]+(?:grade(?:\s+students?)?|graders)\b/gi))add(m,[Number(m[1])],false);
  if(invalid||!matches.length||matches.some(m=>m.min!==matches[0].min||m.max!==matches[0].max))return null;
  return {min:matches[0].min,max:matches[0].max};
}
