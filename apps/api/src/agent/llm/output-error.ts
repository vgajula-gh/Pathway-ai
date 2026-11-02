import {HttpError} from '../../lib/errors.js';

export type AIOutputCode = 'missing_model'|'incomplete_response'|'refused_response'|'invalid_json';
const messages:Record<AIOutputCode,string>={
  missing_model:'The website owner needs to configure the AI model.',
  incomplete_response:'AI could not finish its response. Try a shorter question. If this keeps happening, ask the app owner to check the AI model settings.',
  refused_response:'The AI service could not provide this response. Try another question.',
  invalid_json:'The AI service returned an unreadable response. Please try again.',
};
/** Fixed diagnostics only; never include provider text or prompts in an exception. */
export class AIOutputError extends HttpError {
  constructor(public code:AIOutputCode,public finishReason?:'length'|'content_filter'|'empty'|'refusal') {
    super(code==='missing_model'?503:502,messages[code]);this.name='AIOutputError';
  }
}
