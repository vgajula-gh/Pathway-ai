export type ProgramKnowledgeDetail={state:string;reason:string;message:string;retryable:boolean;resetsAt?:string};

export default function ProgramKnowledgeStatus({state,detail,selected=false}:{state?:string;detail?:ProgramKnowledgeDetail;selected?:boolean}) {
  if(state==='ready')return null;
  const message=detail?.message||(state==='preparing'?'Preparing program details…':!state&&!selected?'Save to Interested to prepare program questions.':'Program questions are taking a break. Your program link still works.');
  return <p className="note" role="status">{message}{detail?.resetsAt&&<> Allowance resets {new Date(detail.resetsAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}.</>}</p>;
}
