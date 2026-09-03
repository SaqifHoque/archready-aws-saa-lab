import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const sourcePath = path.resolve(process.argv[2] || 'data/questions.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context, { filename: sourcePath });

const bank = context.window.AWS_QUESTION_BANK;
if (!Array.isArray(bank) || !bank.length) {
  throw new Error('Question bank did not define a non-empty window.AWS_QUESTION_BANK array.');
}

const ids = new Set();
const normalizedQuestions = new Set();
const issues = [];
const excluded = [];

for (const [index, question] of bank.entries()) {
  const label = `record ${index + 1}`;
  if (typeof question?.question !== 'string' || question.question.trim().length < 8) {
    excluded.push(label);
    continue;
  }
  if (!Number.isInteger(question?.id) || question.id < 1) issues.push(`${label}: invalid id`);
  if (ids.has(question?.id)) issues.push(`${label}: duplicate id ${question.id}`);
  ids.add(question?.id);
  if (typeof question?.answer !== 'string' || !question.answer.trim()) issues.push(`${label}: missing answer`);
  if (!Number.isInteger(question?.selectionsRequired) || question.selectionsRequired < 1 || question.selectionsRequired > 5) issues.push(`${label}: invalid selectionsRequired`);
  if (typeof question?.category !== 'string' || !question.category.trim()) issues.push(`${label}: missing category`);
  if (typeof question?.topic !== 'string' || !question.topic.trim()) issues.push(`${label}: missing topic`);
  if (typeof question?.examDomain !== 'string' || !question.examDomain.trim()) issues.push(`${label}: missing exam domain`);
  const normalized = String(question?.question || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (normalizedQuestions.has(normalized)) issues.push(`${label}: duplicate normalized question`);
  normalizedQuestions.add(normalized);
}

if (issues.length) {
  console.error(`Question-bank validation failed with ${issues.length} issue(s):`);
  for (const issue of issues.slice(0, 40)) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Validated ${ids.size} usable questions with ${ids.size} unique IDs.`);
if (excluded.length) console.warn(`Excluded ${excluded.length} malformed source record(s): ${excluded.join(', ')}.`);
