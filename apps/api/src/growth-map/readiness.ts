import {Prisma} from '@prisma/client';
import {prisma} from '../lib/db.js';
const required=['Skill','StudentSkill','SkillEvidence','SkillTagSuggestion','GrowthFocus','GrowthReview','SkillRequest','GrowthInsightState','GrowthInsightDismissal','GrowthLetter'];
/** Read-only zero-row queries validate every required scalar column without loading student records. */
export async function growthReadiness() {
  const checks=[];
  for(const name of required){const model=Prisma.dmmf.datamodel.models.find(m=>m.name===name)!;
    const columns=model.fields.filter(f=>f.kind!=='object').map(f=>`"${f.dbName??f.name}"`).join(',');
    try{await prisma.$queryRawUnsafe(`SELECT ${columns} FROM "${model.dbName??model.name}" WHERE 1=0`);checks.push({table:name,ready:true,issue:null});}
    catch{checks.push({table:name,ready:false,issue:'table_or_columns_unavailable'});}
  }
  return {ready:checks.every(c=>c.ready),drop1Ready:checks.slice(0,7).every(c=>c.ready),drop2Ready:checks.slice(7,9).every(c=>c.ready),drop3Ready:checks.slice(9).every(c=>c.ready),checks,action:'If setup is missing, apply development migrations, then review/apply production additions during Replit Publish. Preserve existing data.',checkedAt:new Date().toISOString()};
}
