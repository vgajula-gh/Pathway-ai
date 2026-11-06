import { readFileSync } from 'node:fs';
import { ReportSchema, compareReports } from '../apps/api/evals/scorecard.js';

try {
  const paths = process.argv.slice(2);
  if (paths.length !== 2) throw new Error('usage');
  const reports = paths.map(path => ReportSchema.parse(JSON.parse(readFileSync(path, 'utf8'))));
  console.log(compareReports(reports[0], reports[1]));
} catch {
  console.error('Supply two valid report.json files with the same mode, dataset and case IDs.');
  process.exitCode = 2;
}
