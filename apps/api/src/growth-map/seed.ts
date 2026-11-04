import {Prisma} from '@prisma/client';
import {prisma} from '../lib/db.js';
import {SKILL_CATALOG} from './catalog.js';
/** Replit schema previews create tables but do not execute migration INSERTs.
 * Seed only public catalog data; tolerate a pending feature schema at startup. */
export async function seedGrowthCatalog() {
  try {
    await prisma.skill.findFirst({select:{id:true}});
    await prisma.$transaction(SKILL_CATALOG.map(s=>prisma.skill.upsert({where:{id:s.id},create:{...s,synonyms:JSON.stringify(s.synonyms)},update:{...s,synonyms:JSON.stringify(s.synonyms)}})));
    return {available:true};
  } catch(e) {
    if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2021','P2022'].includes(e.code))return {available:false};
    throw e;
  }
}
