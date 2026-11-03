import {z} from 'zod';
import {zodToJsonSchema} from 'zod-to-json-schema';
import type {JSONSchema} from '../agent/llm/types.js';

const nullableText=z.string().max(500).nullable();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const list=(length=80)=>z.array(z.string().max(length)).max(20).nullable();
const https=z.string().url().refine(v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443');}catch{return false;}});
export const ResearchEvidence=z.object({field:z.enum(['name','organizer','category','gradeEligibility','ageEligibility','costType','costAmount','financialAidNote','deadline','applicationStatus','format','city','state']),quote:z.string().min(1).max(400).refine(v=>v.trim().split(/\s+/).length<=25),sourceUrl:https}).strict();
export const ResearchDetails=z.object({
  organizer:nullableText,category:nullableText,gradeEligibility:nullableText,ageEligibility:nullableText,
  costType:z.enum(['free','tuition_free_other_costs','paid','unknown']),costAmount:nullableText,financialAidNote:nullableText,
  deadline:date,applicationStatus:z.enum(['open','rolling','opening_soon','closed','unknown']),
  format:z.enum(['online','in_person','hybrid','unknown']),city:nullableText,state:nullableText,whyItFits:nullableText,
  evidence:z.array(ResearchEvidence).max(16),
}).strict();
export type ResearchDetails=z.infer<typeof ResearchDetails>;
export const ResearchOutput=z.object({
  candidates:z.array(z.object({name:z.string().min(1).max(200),officialUrl:https,
    interests:z.array(z.string().max(80)).max(10),costHint:z.enum(['free','paid','unknown']),details:ResearchDetails.optional()}).strict()).max(16),
  searchThemesUsed:z.array(z.string().max(100)).max(10),
}).strict();
export type ResearchOutput=z.infer<typeof ResearchOutput>;

export const FactFields={
  name:nullableText,organizer:nullableText,officialUrl:nullableText,category:nullableText,
  gradeMin:z.number().int().min(1).max(12).nullable(),gradeMax:z.number().int().min(1).max(12).nullable(),
  schoolLevel:z.enum(['high_school','college','adult','unknown']),minAge:z.number().min(1).max(100).nullable(),
  format:z.enum(['online','in_person','hybrid','unknown']),region:list(80),city:nullableText,state:nullableText,
  costType:z.enum(['free','paid','tuition_free_other_costs','unknown']),costAmount:nullableText,
  costMin:z.number().min(0).max(1000000).nullable(),costMax:z.number().min(0).max(1000000).nullable(),currency:z.enum(['USD','other','unknown']),
  additionalCosts:nullableText,financialAidNote:nullableText,commitment:nullableText,
  hoursMin:z.number().min(0).max(168).nullable(),hoursMax:z.number().min(0).max(168).nullable(),
  skills:list(),tags:list(),deadline:date,openingDate:date,activityDate:date,startDate:date,endDate:date,
  applicationStatus:z.enum(['open','rolling','opening_soon','closed','unknown']),eligibilityNotes:nullableText,
  requirements:list(240),parentConsent:z.boolean().nullable(),parentActionDetails:nullableText,
  projectBased:z.boolean().nullable(),portfolioValue:z.enum(['high','medium','low','unknown']),
};
export const ScoutFacts=z.object({...FactFields,
  evidence:z.object(Object.fromEntries(Object.keys(FactFields).map(k=>[k,z.array(z.string().regex(/^p\d+-s\d+$/)).min(1).max(3).nullable()])) as Record<keyof typeof FactFields,z.ZodNullable<z.ZodArray<z.ZodString>>>).strict(),
}).strict();
export type ScoutFacts=z.infer<typeof ScoutFacts>;
export function jsonSchema(schema:z.ZodTypeAny,name:string):JSONSchema {
  const {$schema,...body}=zodToJsonSchema(schema,{$refStrategy:'none',target:'openAi'});
  return {name,schema:body};
}
// OpenAI strict output supports patterns, but not JSON Schema's `uri` format.
// The provider only constrains the prefix; local ResearchOutput still validates
// URL syntax, HTTPS, credentials and ports before a lead reaches source fetching.
const providerURL=z.string().regex(/^https:\/\//);
const ProviderDetails=ResearchDetails.extend({evidence:z.array(ResearchEvidence.extend({sourceUrl:providerURL})).max(16)});
const ProviderResearch=ResearchOutput.extend({candidates:z.array(ResearchOutput.shape.candidates.element.extend({officialUrl:providerURL,details:ProviderDetails.nullable()})).max(16)});
export const ResearchJSON=jsonSchema(ProviderResearch,'opportunity_leads');
export const FactsJSON=jsonSchema(ScoutFacts,'source_backed_program');
