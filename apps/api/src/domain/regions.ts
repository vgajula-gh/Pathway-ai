import { z } from 'zod';
import zipcodes from 'zipcodes';
export const normalizedRegion=(value:string)=>/^(?:united states(?: of america)?|u\.?s\.?a?\.?)$/i.test(value.trim())?'US':/^(?:virtual|online)$/i.test(value.trim())?'virtual':zipcodes.states.normalize(value)||value;
export const STATES =
  'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(
    ' ',
  );
export const Region = z
  .string()
  .refine((v) => v === '' || v === 'virtual' || STATES.includes(v), 'Choose a US state or Virtual only');
