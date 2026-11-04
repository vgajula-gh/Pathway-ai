import {Sheet} from '../ui';
import SkillTagReview from './SkillTagReview';
import type {SourceType} from './types';
export default function ReviewSheet({source,onClose,onSaved}:{source:{type:SourceType;id:string;linkedMilestoneId?:string};onClose:()=>void;onSaved?:()=>void}) {
  return <Sheet title="Your activity and skills" onClose={onClose}><SkillTagReview {...source} onSaved={()=>{onSaved?.();onClose();}}/></Sheet>;
}
