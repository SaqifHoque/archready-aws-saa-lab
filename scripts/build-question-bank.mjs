import fs from 'node:fs';
import path from 'node:path';

const source = process.argv[2];
const output = process.argv[3] ?? 'data/questions.js';

if (!source) {
  console.error('Usage: node scripts/build-question-bank.mjs <source.txt> [output.js]');
  process.exit(1);
}

const raw = fs.readFileSync(source, 'utf8').replace(/\r/g, '');
const header = /^(?:\s*(?:IMP>+\s*)?)?(\d+)\s*[\].]\s*/gm;
const starts = [...raw.matchAll(header)].filter((match) => {
  const lead = raw.slice(match.index + match[0].length, match.index + match[0].length + 90).trim();
  return lead.length > 0 && !/^(?:Real-time Data Stream|Data Transformation|Scalability)\s*:/i.test(lead);
});

// The supplied source has a numbering typo: the entry between 314 and 316 is labeled 215.
for (let index = 1; index < starts.length - 1; index += 1) {
  if (Number(starts[index - 1][1]) === 314 && Number(starts[index][1]) === 215 && Number(starts[index + 1][1]) === 316) {
    starts[index][1] = '315';
  }
}

function tidy(value) {
  return value
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

function categoryFor(text) {
  const rules = [
    ['Storage', /\b(S3|EBS|EFS|FSx|Storage Gateway|Snowball|Glacier)\b/i],
    ['Databases', /\b(RDS|Aurora|DynamoDB|database|ElastiCache|Neptune|DocumentDB)\b/i],
    ['Networking', /\b(VPC|CloudFront|Route 53|load balancer|Direct Connect|VPN|PrivateLink|Global Accelerator|network)\b/i],
    ['Security', /\b(IAM|KMS|Secrets Manager|WAF|Shield|Firewall|security|encrypt|credential)\b/i],
    ['Compute', /\b(EC2|Lambda|Fargate|ECS|EKS|Auto Scaling|Elastic Beanstalk|Batch)\b/i],
    ['Integration', /\b(SQS|SNS|EventBridge|Step Functions|API Gateway|Amazon MQ|Kinesis)\b/i],
    ['Analytics', /\b(Athena|Redshift|QuickSight|Glue|EMR|Lake Formation|analytics|data lake)\b/i],
    ['Migration', /\b(migrat|DMS|DataSync|Migration Hub|Application Migration Service)\b/i],
    ['Operations', /\b(CloudWatch|CloudTrail|Systems Manager|Config|Organizations|Control Tower|cost)\b/i],
  ];
  return rules.find(([, regex]) => regex.test(text))?.[0] ?? 'Architecture';
}

function parseBlock(match, nextOffset) {
  const id = Number(match[1]);
  const start = match.index + match[0].length;
  const block = raw.slice(start, nextOffset)
    .replace(/^[-=_]{8,}\s*$/gm, '')
    .trim();
  const lines = block.split('\n').map((line) => line.trim());

  const markedIndex = lines.findIndex((line) => /^(?:ans(?:wer)?s?\s*[-:]\s*|correct answer\s*[A-E]?\s*:\s*)/i.test(line));
  const optionIndex = lines.findIndex((line, index) => index > 0 && /^[A-E][.)]\s+\S/.test(line));
  let answerIndex = [markedIndex, optionIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? -1;
  if (answerIndex < 0) {
    const questionLine = lines.findIndex((line) => /\?\s*$/.test(line));
    if (questionLine >= 0) answerIndex = lines.findIndex((line, index) => index > questionLine && line.length > 0);
  }
  if (answerIndex < 0) answerIndex = lines.length;

  const question = tidy(lines.slice(0, answerIndex).join(' '));
  const remainder = lines.slice(answerIndex);
  const answerLines = [];
  let cursor = 0;

  const wanted = /choose two|select two/i.test(question) ? 2 : 1;
  while (cursor < remainder.length) {
    const line = remainder[cursor];
    if (!line) {
      if (answerLines.length && answerLines.length >= wanted) break;
      cursor += 1;
      continue;
    }
    const isFirst = answerLines.length === 0;
    const isMarked = /^(?:ans(?:wer)?s?\s*[-:]\s*|correct answer\s*[A-E]?\s*:\s*|[A-E][.)]\s+)/i.test(line);
    const followsMulti = answerLines.length > 0 && /^[A-E][.)]\s+/.test(line);
    if (isFirst || isMarked || followsMulti) {
      answerLines.push(line.replace(/^(?:ans(?:wer)?s?\s*[-:]\s*|correct answer\s*[A-E]?\s*:\s*)/i, '').trim());
      cursor += 1;
      if (answerLines.length >= wanted) break;
      continue;
    }
    break;
  }

  if (wanted > 1 && answerLines.length < wanted) {
    for (let index = cursor; index < remainder.length && answerLines.length < wanted; index += 1) {
      if (/^[A-E][.)]\s+\S/.test(remainder[index])) answerLines.push(remainder[index]);
    }
  }

  let answer = tidy(answerLines.join('\n')) || 'Answer unavailable in source';
  if (answer.length < 8) answer = 'Answer unavailable in source';
  const explanation = tidy(remainder.slice(cursor).join('\n')) || 'No additional explanation was supplied in the source bank.';
  const selectionsRequired = wanted;
  const lowConfidence = /disputed|lower confidence|could not find a fully authoritative|answer unavailable/i.test(block) || answer === 'Answer unavailable in source' || /\n\s*Answer\s*:/i.test(explanation);

  return {
    id,
    question,
    answer,
    explanation,
    category: categoryFor(`${question} ${answer}`),
    selectionsRequired,
    confidence: lowConfidence ? 'review' : 'source',
  };
}

const questions = starts.map((match, index) => parseBlock(match, starts[index + 1]?.index ?? raw.length));
const banner = `// Generated from the supplied study bank. Rebuild with scripts/build-question-bank.mjs.\n`;
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${banner}window.AWS_QUESTION_BANK = ${JSON.stringify(questions, null, 2)};\n`);

const missing = questions.filter((item) => !item.question || item.answer === 'Answer unavailable in source');
console.log(`Generated ${questions.length} questions (${missing.length} incomplete) at ${output}`);
console.log(`IDs: ${questions[0]?.id ?? 'n/a'}-${questions.at(-1)?.id ?? 'n/a'}`);
