import {z} from 'zod';
import {STATES} from './regions.js';

/** Optional discovery preferences; never a second copy of the student's schedule. */
export const DiscoveryPreferences = z.object({
  city:z.string().trim().max(80).regex(/^[\p{L} .'-]*$/u,'Enter a city name, without a street address').default(''),
  state:z.string().trim().refine(s=>!s||STATES.includes(s),'Choose a US state').default(''),
  radiusMiles:z.number().min(1).max(1000).default(50),
  format:z.enum(['both','online','in_person']).default('both'),
  goals:z.string().trim().max(1000).default(''),
  personalProject:z.string().trim().max(1500).default(''),
  hoursPerWeek:z.number().min(0).max(168).nullable().default(null),
  maxCost:z.number().min(0).max(100000).nullable().default(null),
  currency:z.literal('USD').default('USD'),
}).strict();
export type DiscoveryPreferences = z.infer<typeof DiscoveryPreferences>;
export const DiscoveryPreferencesPatch=DiscoveryPreferences.partial();
export function discoveryPreferences(value:string|unknown):DiscoveryPreferences {
  try {return DiscoveryPreferences.parse(typeof value==='string'?JSON.parse(value):value||{});}
  catch {return DiscoveryPreferences.parse({});}
}
