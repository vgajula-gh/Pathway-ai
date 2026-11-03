import type {Prisma} from '@prisma/client';
import {HttpError} from '../lib/errors.js';
import {discoveryReservationUsd,scoutPricing} from '../scout/costs.js';
export type SpendReservation={month:string;units:number};
type Db=Pick<Prisma.TransactionClient,'aIUsage'|'discoveryUsage'>;
const scale=10000;
const units=(usd:number)=>Math.ceil(Math.max(0,usd)*scale);
export async function discoverySpend(db:Db,now=new Date()) {
  const month=now.toISOString().slice(0,7),key='discovery-spend:'+month;
  const [ledger,legacy]=await Promise.all([db.aIUsage.findUnique({where:{key}}),db.discoveryUsage.findUnique({where:{month}})]);
  const used=ledger?.count??units(legacy?.estimatedCost||0),required=units(discoveryReservationUsd()),cap=units(scoutPricing().monthly);
  return {month,key,used,required,cap,available:cap>0&&used+required<=cap,estimatedSpentAndReservedUsd:used/scale,limitUsd:cap/scale,reservationUsd:required/scale,costIsEstimate:true};
}
/** Count reservations before funding, under the same serializable transaction as
 * run/AI counters. No new table or production schema update is required. */
export async function reserveDiscoverySpend(tx:Prisma.TransactionClient,now:Date):Promise<SpendReservation> {
  const s=await discoverySpend(tx,now);
  if(s.cap===0)throw new HttpError(429,"Live search has reached this month's estimated budget. Existing results are still available.");
  await tx.aIUsage.upsert({where:{key:s.key},create:{key:s.key,count:s.used},update:{}});
  const held=await tx.aIUsage.updateMany({where:{key:s.key,count:{lte:s.cap-s.required}},data:{count:{increment:s.required}}});
  if(!held.count)throw new HttpError(429,"Live search has reached this month's estimated budget. Existing results are still available.");
  return {month:s.month,units:s.required};
}
export async function settleDiscoverySpend(tx:Prisma.TransactionClient,reservation:SpendReservation|undefined,estimate:number) {
  if(!reservation)return;
  // Called only after the run's running -> terminal compare-and-set succeeds.
  await tx.aIUsage.update({where:{key:'discovery-spend:'+reservation.month},data:{count:{increment:units(estimate)-reservation.units}}});
}
