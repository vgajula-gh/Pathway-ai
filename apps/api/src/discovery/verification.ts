import {assessOpportunity} from '../domain/opportunity-verification.js';
import {DiscoveryFailure} from './failures.js';

export function verifyCandidate(...args:Parameters<typeof assessOpportunity>) {
  const {opportunity,verification}=assessOpportunity(...args);
  if(opportunity.verificationStatus!=='verified')throw new DiscoveryFailure({stage:'verify',code:'missing_evidence',verification,sourceHost:opportunity.officialDomain});
  return opportunity;
}
