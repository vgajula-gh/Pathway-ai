import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import ProgramKnowledgeStatus from '../../web/src/components/ProgramKnowledgeStatus';
it('distinguishes unsaved, preparing, limited and failed details without suggesting another paid search',()=>{
 const render=(props:any)=>renderToStaticMarkup(createElement(ProgramKnowledgeStatus,props));
 expect(render({})).toContain('Save to Interested');
 expect(render({state:'preparing'})).toContain('Preparing program details');
 const limited=render({state:'unavailable',selected:true,detail:{state:'unavailable',reason:'preparation_monthly_limit',message:'The shared preparation allowance has been reached.',retryable:false,resetsAt:'2030-12-01T00:00:00Z'}});
 expect(limited).toContain('allowance');expect(limited).toContain('Allowance resets');expect(limited).not.toContain('Preparing program details');
 const failed=render({state:'unavailable',selected:true,detail:{state:'unavailable',reason:'retry_required',message:'These details could not finish preparing. Your links still work.',retryable:true}});
 expect(failed).toContain('could not finish');expect(failed).toContain('role="status"');expect(render({state:'ready'})).toBe('');
});
