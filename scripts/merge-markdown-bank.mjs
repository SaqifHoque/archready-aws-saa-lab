import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { generateExplanation } from './explanation-generator.mjs';

const archivePath = process.argv[2];
const bankPath = process.argv[3] || 'data/questions.js';
const SOURCE = 'markdown-practice-bank-2026';

if (!archivePath) {
  console.error('Usage: node scripts/merge-markdown-bank.mjs <repository.zip|README.md> [questions.js]');
  process.exit(1);
}

function loadBank(file) {
  const source = fs.readFileSync(file, 'utf8');
  const match = source.match(/window\.AWS_QUESTION_BANK\s*=\s*([\s\S]*);\s*$/);
  if (!match) throw new Error(`Could not read question data from ${file}`);
  return JSON.parse(match[1]);
}

function loadMarkdown(file) {
  if (!file.toLowerCase().endsWith('.zip')) return fs.readFileSync(file, 'utf8');
  return execFileSync('unzip', ['-p', file, '*/README.md'], { encoding: 'utf8', maxBuffer: 12_000_000 });
}

function clean(value) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\bFi les\b/g, 'Files')
    .replace(/\bfi les\b/g, 'files')
    .replace(/\bsing le\b/g, 'single')
    .replace(/\bru les\b/g, 'rules')
    .replace(/\bfie ld\b/g, 'field')
    .replace(/\btrac\b/g, 'traffic')
    .replace(/\bIOS IPS\b/g, 'IDS/IPS')
    .replace(/identity provider \(IOP\)/g, 'identity provider (IdP)')
    .replace(/single sign-on \(550\)/g, 'single sign-on (SSO)')
    .replace(/overall lime for executing jobs/g, 'overall time for executing jobs')
    .replace(/messages would remain in SQS and worn can continue/g, 'messages would remain in SQS and work can continue')
    .replace(/overwrite PU\./g, 'overwrite PUT.')
    .replace(/\s+/g, ' ')
    .trim();
}

function fingerprint(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(value) {
  return new Set(fingerprint(value).split(' ').filter((token) => token.length > 2));
}

function similarity(leftValue, rightValue) {
  const left = tokens(leftValue); const right = tokens(rightValue);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / (left.size + right.size - overlap);
}

function categoryFor(value) {
  const text = value.toLowerCase();
  if (/\b(iam|kms|encrypt|security|waf|shield|guardduty|inspector|macie|certificate|credential|access control)\b/.test(text)) return 'Security';
  if (/\b(vpc|subnet|route 53|cloudfront|load balanc|direct connect|vpn|network|dns|gateway)\b/.test(text)) return 'Networking';
  if (/\b(s3|ebs|efs|fsx|glacier|storage|snapshot|file system)\b/.test(text)) return 'Storage';
  if (/\b(rds|aurora|dynamodb|redshift|database|elasticache|mysql|postgres|oracle)\b/.test(text)) return 'Databases';
  if (/\b(sqs|sns|eventbridge|step functions|message|queue)\b/.test(text)) return 'Integration';
  if (/\b(athena|glue|emr|kinesis|analytics|data warehouse)\b/.test(text)) return 'Analytics';
  if (/\b(migrat|dms|datasync|snowball|storage gateway)\b/.test(text)) return 'Migration';
  if (/\b(cloudwatch|cloudtrail|config|systems manager|monitor|logging)\b/.test(text)) return 'Operations';
  if (/\b(ec2|lambda|ecs|eks|fargate|auto scaling|compute|container)\b/.test(text)) return 'Compute';
  return 'Architecture';
}

const markdown = loadMarkdown(archivePath).replace(/\r/g, '');
const headers = [...markdown.matchAll(/^### (.+)$/gm)];
const parsed = headers.map((header, index) => {
  const block = markdown.slice(header.index + header[0].length, headers[index + 1]?.index ?? markdown.length);
  const options = [...block.matchAll(/^- \[([ xX])\] (.+)$/gm)]
    .map((match) => ({ correct: match[1].toLowerCase() === 'x', text: clean(match[2]) }));
  const selected = options.filter((option) => option.correct).map((option) => option.text);
  const question = {
    id: 40001 + index,
    sourceQuestionNumber: index + 1,
    question: clean(header[1]),
    answer: selected.join('\n'),
    explanation: '',
    category: categoryFor(`${header[1]} ${selected.join(' ')}`),
    options: options.map((option) => option.text),
    selectionsRequired: selected.length,
    confidence: 'source',
    source: SOURCE,
  };
  question.explanation = generateExplanation(question);
  question.explanationSource = 'generated-from-supplied-answer';
  return question;
});

const base = loadBank(bankPath).filter((question) => question.source !== SOURCE);
const accepted = [];
const duplicates = [];
const invalid = [];

for (const question of parsed) {
  if (question.question.length < 8 || question.options.length < 2 || !question.answer || question.selectionsRequired < 1) {
    invalid.push(question.sourceQuestionNumber);
    continue;
  }
  const candidates = [...base, ...accepted];
  const exact = candidates.find((candidate) => fingerprint(candidate.question) === fingerprint(question.question));
  const near = exact ? null : candidates.find((candidate) => similarity(candidate.question, question.question) >= 0.94);
  if (exact || near) duplicates.push({ sourceQuestionNumber: question.sourceQuestionNumber, matches: (exact || near).id, similarity: exact ? 1 : Number(similarity((exact || near).question, question.question).toFixed(3)) });
  else accepted.push(question);
}

const merged = [...base, ...accepted];
const banner = '// Generated from the supplied study bank and authorized practice resources. See scripts for rebuild steps.\n';
fs.writeFileSync(bankPath, `${banner}window.AWS_QUESTION_BANK = ${JSON.stringify(merged, null, 2)};\n`);
console.log(JSON.stringify({ parsed: parsed.length, added: accepted.length, duplicatesSkipped: duplicates.length, invalidSkipped: invalid.length, mergedRecords: merged.length, duplicates, invalid }, null, 2));
