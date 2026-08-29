import fs from 'node:fs';
import path from 'node:path';

const topicRoot = process.argv[2];
const bankPath = process.argv[3] ?? 'data/questions.js';

if (!topicRoot) {
  console.error('Usage: node scripts/merge-topic-bank.mjs <extracted-repository-root> [questions.js]');
  process.exit(1);
}

const TOPICS = {
  '01-AWS-Fundamentals': ['AWS Fundamentals', 'Fundamentals'],
  '02-IAM': ['IAM & Governance', 'Security'],
  '03-Compute': ['Compute', 'Compute'],
  '04-Storage': ['Storage', 'Storage'],
  '05-Database': ['Databases', 'Databases'],
  '06-Networking': ['Networking', 'Networking'],
  '07-Security': ['Security', 'Security'],
  '08-Application-Integration': ['Application Integration', 'Integration'],
  '09-Monitoring': ['Monitoring & Operations', 'Operations'],
  '10-Migration': ['Migration', 'Migration'],
  '11-Analytics': ['Analytics', 'Analytics'],
  '12-Architecture-Patterns': ['Architecture Patterns', 'Architecture'],
  '13-Cost-Optimization': ['Cost Optimization', 'Operations'],
};

function loadBank(file) {
  const source = fs.readFileSync(file, 'utf8');
  const match = source.match(/window\.AWS_QUESTION_BANK\s*=\s*([\s\S]*);\s*$/);
  if (!match) throw new Error(`Could not read question data from ${file}`);
  return JSON.parse(match[1]);
}

function cleanMarkdown(value) {
  return value
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function fingerprint(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(value) {
  return new Set(fingerprint(value).split(' ').filter((token) => token.length > 2));
}

function similarity(a, b) {
  const left = tokens(a); const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / (left.size + right.size - overlap);
}

function parseFile(file, topic, category, topicIndex) {
  const source = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  const headers = [...source.matchAll(/^### Question\s+(\d+)\s*$/gm)];
  return headers.map((header, index) => {
    const block = source.slice(header.index + header[0].length, headers[index + 1]?.index ?? source.length);
    const lines = block.split('\n').map((line) => line.trim());
    const firstOption = lines.findIndex((line) => /^[A-F]\.\s+/.test(line));
    const details = lines.findIndex((line) => /^<details>/.test(line));
    const question = cleanMarkdown(lines.slice(0, firstOption).filter((line) => line && line !== '---').join(' '));
    const optionEnd = details >= 0 ? details : lines.length;
    const options = lines.slice(firstOption, optionEnd)
      .filter((line) => /^[A-F]\.\s+/.test(line))
      .map((line) => cleanMarkdown(line.replace(/^[A-F]\.\s+/, '')));
    const answerLine = lines.find((line) => /^\*\*Answer\s*:/i.test(line)) ?? '';
    const letters = [...answerLine.toUpperCase().matchAll(/\b([A-F])\b/g)].map((match) => match[1]);
    const selected = letters.map((letter) => options[letter.charCodeAt(0) - 65]).filter(Boolean);
    const explanationStart = lines.findIndex((line) => /^\*\*Explanation:\*\*/i.test(line));
    let explanationEnd = lines.findIndex((line, lineIndex) => lineIndex > explanationStart && /^\*\*(?:References?|Key Takeaway|Exam Tip)/i.test(line));
    if (explanationEnd < 0) explanationEnd = lines.findIndex((line, lineIndex) => lineIndex > explanationStart && /^<\/details>/.test(line));
    if (explanationEnd < 0) explanationEnd = lines.length;
    const explanation = cleanMarkdown(lines.slice(explanationStart + 1, explanationEnd).filter((line) => line && !/^---$/.test(line)).join('\n'));
    return {
      id: 10000 + topicIndex * 1000 + Number(header[1]),
      question,
      answer: selected.join('\n'),
      explanation: explanation || 'Review the selected AWS service and the requirements in the scenario.',
      category,
      topic,
      options,
      selectionsRequired: selected.length,
      confidence: 'source',
      source: 'topic-bank',
    };
  });
}

const existing = loadBank(bankPath).filter((question) => question.source !== 'topic-bank');
const accepted = [];
const duplicates = [];
const invalid = [];

Object.entries(TOPICS).forEach(([folder, [topic, category]], topicIndex) => {
  const file = path.join(topicRoot, folder, 'PRACTICE-QUESTIONS.md');
  const parsed = parseFile(file, topic, category, topicIndex + 1);
  for (const question of parsed) {
    if (!question.question || question.options.length < 2 || !question.answer || question.selectionsRequired < 1) {
      invalid.push({ topic, id: question.id });
      continue;
    }
    const candidates = [...existing, ...accepted];
    const exact = candidates.find((item) => fingerprint(item.question) === fingerprint(question.question));
    const near = exact ? null : candidates.find((item) => similarity(item.question, question.question) >= 0.94);
    if (exact || near) duplicates.push({ topic, id: question.id, matches: (exact || near).id });
    else accepted.push(question);
  }
});

const merged = [...existing, ...accepted];
const banner = '// Generated from the supplied study bank and topic resources. Rebuild with scripts/build-question-bank.mjs, then scripts/merge-topic-bank.mjs.\n';
fs.writeFileSync(bankPath, `${banner}window.AWS_QUESTION_BANK = ${JSON.stringify(merged, null, 2)};\n`);

console.log(`Topic questions parsed: ${accepted.length + duplicates.length + invalid.length}`);
console.log(`Added: ${accepted.length}; duplicates skipped: ${duplicates.length}; invalid skipped: ${invalid.length}`);
console.log(`Merged bank entries: ${merged.length}`);
if (duplicates.length) console.log('Duplicate matches:', JSON.stringify(duplicates));
if (invalid.length) console.log('Invalid entries:', JSON.stringify(invalid));
