export type Stage='Learn'|'Build'|'Apply'|'Present'|'Compete';
export type SourceType='portfolio'|'milestone'|'study'|'application';
export interface CatalogSkill {id:string;name:string;area:string;synonyms:string[]}
export interface Catalog {version:number;areas:string[];skills:CatalogSkill[]}
export interface MapSkill extends CatalogSkill {hidden:boolean;focus:boolean;count:number;recent:number;lastActivity:string|null;reached:Stage[];highest:Stage|null;next:Stage|null;thisMonth:number;previousAverage:number;growing:boolean}
export interface GrowthMapData {date:string;month:string;skills:MapSkill[];hidden:MapSkill[];connections:{a:string;b:string;count:number}[];activityCount:number;reviewCount:number;suggestedCount:number;focusSkillId:string|null;interests:string[]}
export interface Activity {key:string;type:SourceType;id:string;title:string;date:string|null;kind:string;defaultStage:Stage|null;allowedStages:Stage[];eligible:boolean;note:string;reviewed:boolean;tags:{skillId:string;stage:Stage|null}[];suggestions:string[];reflection?:string;linkedMilestoneId?:string|null;original?:Record<string,unknown>}
export interface SkillDetail {interestSources?:Activity[];skill:MapSkill;evidence:{id:string;title:string;date:string;stage:Stage;sources:{type:SourceType;id:string;title:string;date:string;stage?:Stage}[]}[];ladder:{stage:Stage;description:string;reached:boolean;next:boolean}[];connections:{a:string;b:string;count:number}[]}
export const areaColor=(area:string)=>area==='Creative'||area==='Business'?'var(--rose)':area==='Communication'||area==='Leadership & service'?'var(--peach)':'var(--peri)';
export const stageLabel=(stage:Stage|null)=>stage??'Interest only';
