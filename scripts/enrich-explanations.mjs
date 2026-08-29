import fs from 'node:fs';
import { generateExplanation, needsExplanation } from './explanation-generator.mjs';

const bankPath = process.argv[2] || 'data/questions.js';
const refreshGenerated = process.argv.includes('--refresh-generated');
const source = fs.readFileSync(bankPath, 'utf8');
const match = source.match(/window\.AWS_QUESTION_BANK\s*=\s*([\s\S]*);\s*$/);
if (!match) throw new Error(`Could not read question data from ${bankPath}`);
const questions = JSON.parse(match[1]);
let enriched = 0;

for (const question of questions) {
  const usable = question.question?.trim().length >= 8 && question.answer && !/unavailable in source/i.test(question.answer);
  if (usable && (needsExplanation(question) || (refreshGenerated && question.explanationSource === 'generated-from-supplied-answer'))) {
    question.explanation = generateExplanation(question);
    question.explanationSource = 'generated-from-supplied-answer';
    enriched += 1;
  }
}

const banner = '// Generated from the supplied study bank and authorized practice resources. See scripts for rebuild steps.\n';
fs.writeFileSync(bankPath, `${banner}window.AWS_QUESTION_BANK = ${JSON.stringify(questions, null, 2)};\n`);
console.log(JSON.stringify({ records: questions.length, explanationsAdded: enriched }, null, 2));
