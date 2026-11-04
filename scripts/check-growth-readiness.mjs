// Read-only: use the DATABASE_URL of the environment you intend to check.
import {growthReadiness} from '../apps/api/src/growth-map/readiness.ts';
import {prisma} from '../apps/api/src/lib/db.ts';
try {const result=await growthReadiness();console.log(JSON.stringify(result,null,2));if(!result.ready)process.exitCode=1;}
catch {console.error('Growth Map readiness could not be checked. Confirm DATABASE_URL and generate the matching Prisma client. No schema changes were made.');process.exitCode=1;}
finally{await prisma.$disconnect();}
