import fs from 'node:fs';
import vm from 'node:vm';

const input = process.argv[2] || 'data/questions.js';
const output = process.argv[3] || input;
const source = fs.readFileSync(input, 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: input });
const questions = sandbox.window.AWS_QUESTION_BANK;

if (!Array.isArray(questions)) throw new Error(`No question bank found in ${input}`);

// High-confidence repairs for OCR/PDF extraction damage in authorized source text.
// Each repair is ID-scoped so valid technical wording elsewhere is never changed.
const textRepairs = new Map([
  [7, { answer: [['Amazon SOS', 'Amazon SQS']] }],
  [144, { question: [['CPUUtilizalion', 'CPUUtilization']] }],
  [241, { question: [['n online learning company', 'An online learning company']] }],
  [253, {
    question: [['policy que.', 'Question text unavailable in source.']],
    answer: [['C. Deleting Amazon EC2 instances.', 'Answer unavailable in source']],
  }],
  [363, { explanation: [['cocurrently', 'concurrently']] }],
  [419, { answer: [['whenthe', 'when the']] }],
  [440, { question: [['edition ofAmazon Aurora', 'edition of Amazon Aurora']] }],
  [481, { question: [
    ['Multi-AZAmazon RDS', 'Multi-AZ Amazon RDS'],
    ['database layer Amazon ElastiCache', 'database layer. Amazon ElastiCache'],
  ] }],
  [510, { answer: [['eu-west-1 VPUpdate the subnet', 'eu-west-1 VPC. Update the subnet']] }],
  [563, { question: [[
    'clusters and workloads from a central location. Which solution will meet these requirements with the LEAST operational overhead?',
    'A company operates Kubernetes clusters in AWS and in external environments. The company wants to view and manage the clusters and workloads from a central location. Which solution will meet these requirements with the LEAST operational overhead?',
  ]] }],
  [571, { answer: [['signed by the third-party CImport the certificate', 'signed by the third-party CA. Import the certificate']] }],
  [636, { answer: [['Configure the SOS queue', 'Configure the SQS queue']] }],
  [639, { question: [['fleet ofAmazon EC2', 'fleet of Amazon EC2']] }],
  [646, { question: [['solutions architect needs to host', 'A solutions architect needs to host']] }],
  [652, { question: [['cluster con guration', 'cluster configuration']] }],
  [653, { question: [['a speci c AWS account', 'a specific AWS account']] }],
  [655, { question: [
    ['session a nity', 'session affinity'],
    ['Session a nity', 'Session affinity'],
    ['must be con gured', 'must be configured'],
  ] }],
  [657, { question: [
    ['multiple o ces', 'multiple offices'],
    ['new o ce CIDR', 'new office CIDR'],
  ] }],
  [658, { question: [
    ['provide le shares', 'provide file shares'],
    ['from the le system', 'from the file system'],
  ] }],
  [666, { question: [['amount of tra c', 'amount of traffic']] }],
  [668, { question: [['a prede ned application', 'a predefined application']] }],
  [671, { question: [
    ['periodic nancial assessments', 'periodic financial assessments'],
    ['recently identi ed unusual', 'recently identified unusual'],
  ] }],
  [673, { question: [
    ['an SMB le server', 'an SMB file server'],
    ['The le server', 'The file server'],
    ['large les', 'large files'],
    ['the le creation', 'the file creation'],
    ['access the les', 'access the files'],
  ] }],
  [674, { question: [
    ['when tra c increases', 'when traffic increases'],
    ['periods of high tra c', 'periods of high traffic'],
  ] }],
  [676, { question: [['information about tra c', 'information about traffic']] }],
  [680, { question: [
    ['copy les from', 'copy files from'],
    ['(Amazon EFS) le system', '(Amazon EFS) file system'],
    ['The les must', 'The files must'],
    ['New les are', 'New files are'],
    ['The copied les', 'The copied files'],
    ['the source le changes', 'the source file changes'],
  ] }],
  [682, { question: [['policies on ndings', 'policies on findings']] }],
]);

const canonicalText = new Map([
  [241, { question: 'An online learning company is migrating to the AWS Cloud. The company maintains its student records in a PostgreSQL database. The company needs a solution in which its data is available and online across multiple AWS Regions at all times. Which solution will meet these requirements with the LEAST amount of operational overhead?' }],
  [563, { question: 'A company operates Kubernetes clusters in AWS and in external environments. The company wants to view and manage the clusters and workloads from a central location. Which solution will meet these requirements with the LEAST operational overhead?' }],
  [646, { question: 'A solutions architect needs to host a high performance computing (HPC) workload in the AWS Cloud. The workload will run on hundreds of Amazon EC2 instances and will require parallel access to a shared file system to enable distributed processing of large datasets. Datasets will be accessed across multiple instances simultaneously. The workload requires access latency within 1 ms. After processing has completed, engineers will need access to the dataset for manual postprocessing. Which solution will meet these requirements?' }],
]);

function applyTextRepairs(question) {
  Object.assign(question, canonicalText.get(question.id) || {});
  const repair = textRepairs.get(question.id);
  if (!repair) return;
  for (const [field, replacements] of Object.entries(repair)) {
    for (const [before, after] of replacements) {
      if (question[field].includes(after)) continue;
      if (question[field].includes(before)) question[field] = question[field].replaceAll(before, after);
      else throw new Error(`Question ${question.id}: expected text not found for ${field} repair`);
    }
  }
}

function validateShape(question, index) {
  const requiredTypes = { id: 'number', question: 'string', answer: 'string', category: 'string', selectionsRequired: 'number' };
  for (const [field, expected] of Object.entries(requiredTypes)) {
    if (typeof question[field] !== expected) throw new TypeError(`Question index ${index}: ${field} must be ${expected}`);
  }
  if (question.options !== undefined && (!Array.isArray(question.options) || question.options.some((option) => typeof option !== 'string'))) {
    throw new TypeError(`Question ${question.id}: options must be an array of strings`);
  }
  if (question.selectionsRequired < 1 || (question.options && question.selectionsRequired > question.options.length)) {
    throw new RangeError(`Question ${question.id}: invalid selectionsRequired value`);
  }
}

const rules = [
  ['IAM & Governance', /\b(iam|identity center|organizations?|organizational unit|service control polic|\bscp\b|permission boundary|assume role|sts|cognito|directory service|control tower)\b/i],
  ['Security', /\b(kms|key management|secrets manager|certificate manager|\bacm\b|shield|\bwaf\b|guardduty|inspector|macie|security hub|network firewall|encryp|credential|ddos|threat|vulnerab)\b/i],
  ['Cost Optimization', /\b(cost explorer|cost allocation|budgets?|savings plans?|reserved instances?|spot instances?|pricing calculator|cheapest|lowest cost|least cost|cost[- ]effective|reduce costs?|minimi[sz]e costs?|billing|free tier)\b/i],
  ['Migration', /\b(migration hub|application migration service|database migration service|\bdms\b|datasync|snowball|snowmobile|transfer family|storage gateway|migrat|on[- ]premises|data center)\b/i],
  ['Analytics', /\b(athena|redshift|quicksight|glue|emr|kinesis|lake formation|open(?:search| search)|data lake|analytics?|query.*s3)\b/i],
  ['Application Integration', /\b(sqs|simple queue|sns|simple notification|eventbridge|step functions?|appflow|mq|message queue|pub(?:lish)?[/-]?sub|fanout|decoupl|workflow)\b/i],
  ['Monitoring & Operations', /\b(cloudwatch|cloudtrail|config rules?|systems manager|parameter store|x-ray|service catalog|cloudformation|opsworks|proton|observability|monitor|alarm|metric|logging|audit)\b/i],
  ['Databases', /\b(rds|aurora|dynamodb|elasticache|memorydb|neptune|documentdb|keyspaces|timestream|database|read replica|global table|dax)\b/i],
  ['Storage', /\b(amazon s3|\bs3\b|elastic file system|\befs\b|elastic block store|\bebs\b|fsx|backup|object storage|file storage|block storage|glacier|lifecycle polic)\b/i],
  ['Networking', /\b(vpc|subnet|route 53|cloudfront|direct connect|transit gateway|internet gateway|nat gateway|vpn|private link|privatelink|network load balancer|application load balancer|\balb\b|\bnlb\b|dns|cidr|elastic load balanc)\b/i],
  ['Compute', /\b(ec2|lambda|fargate|ecs|eks|elastic beanstalk|batch|lightsail|auto scaling|launch template|instance type|serverless|container)\b/i],
  ['AWS Fundamentals', /\b(shared responsibility|availability zone|aws region|edge location|well-architected framework|management console|aws account|global infrastructure)\b/i],
];

const categoryDefaults = {
  Analytics: 'Analytics',
  Architecture: 'Architecture Patterns',
  Compute: 'Compute',
  Databases: 'Databases',
  Integration: 'Application Integration',
  Migration: 'Migration',
  Networking: 'Networking',
  Operations: 'Monitoring & Operations',
  Security: 'Security',
  Storage: 'Storage',
};

function classifyTopic(question) {
  if (question.topic) return question.topic;
  const text = `${question.question || ''}\n${question.answer || ''}`;
  const matching = rules.find(([, pattern]) => pattern.test(text));
  return matching?.[0] || categoryDefaults[question.category] || 'Architecture Patterns';
}

const secure = /\b(iam|identity|permission|policy|role|kms|encryp|secrets?|certificate|\bacm\b|shield|\bwaf\b|guardduty|inspector|macie|security|firewall|credential|access control|authentication|authorization|compliance|ddos|threat|vulnerab)\b/i;
const resilient = /\b(high availability|highly available|fault toleran|resilien|disaster recovery|multi[- ]az|multiple availability zones?|failover|backup|restore|replica|replication|auto scaling|load balanc|route 53|sqs|sns|decoupl|recovery point|recovery time|\brpo\b|\brto\b)\b/i;
const cost = /\b(cost|budget|billing|savings plans?|reserved instances?|spot instances?|pricing|cheapest|economical|lifecycle|glacier|right[- ]siz|free tier|minimi[sz]e .*expense)\b/i;
const performance = /\b(performance|latency|throughput|scale|scalab|cach|accelerat|cloudfront|global accelerator|read replica|provisioned concurrency|iops|bandwidth|optimi[sz]e)\b/i;

function classifyExamDomain(question) {
  const text = `${question.question || ''}\n${question.answer || ''}`;
  const scores = [
    ['Design Secure Architectures', (secure.test(text) ? 4 : 0) + (['IAM & Governance', 'Security'].includes(question.topic) ? 2 : 0)],
    ['Design Resilient Architectures', (resilient.test(text) ? 4 : 0) + (['Architecture Patterns', 'Application Integration'].includes(question.topic) ? 1 : 0)],
    ['Design Cost-Optimized Architectures', (cost.test(text) ? 4 : 0) + (question.topic === 'Cost Optimization' ? 3 : 0)],
    ['Design High-Performing Architectures', (performance.test(text) ? 4 : 0) + (['Compute', 'Storage', 'Databases', 'Networking', 'Analytics'].includes(question.topic) ? 1 : 0)],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] ? scores[0][0] : 'Design High-Performing Architectures';
}

const fingerprints = new Map();
for (const [index, question] of questions.entries()) {
  validateShape(question, index);
  applyTextRepairs(question);
  const fingerprint = String(question.question || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (fingerprint && fingerprints.has(fingerprint)) {
    throw new Error(`Duplicate question text: IDs ${fingerprints.get(fingerprint)} and ${question.id}`);
  }
  if (fingerprint) fingerprints.set(fingerprint, question.id);
  question.topic = classifyTopic(question);
  question.examDomain = classifyExamDomain(question);
}

const unresolvedOcr = /\b(?:speci c|identi ed|prede ned|nancial|con guration|con gured|tra c|a nity|o ces|o ce|ndings|cocurrently|CPUUtilizalion|SOS queue|Amazon SOS|ofAmazon|AZAmazon|VPUpdate|CImport|whenthe|le|les)\b/i;
for (const question of questions) {
  for (const field of ['question', 'answer', 'explanation']) {
    const match = String(question[field] || '').match(unresolvedOcr);
    if (match) throw new Error(`Question ${question.id}: unresolved OCR text "${match[0]}" in ${field}`);
  }
}

const banner = '// Generated from the supplied study bank and authorized practice resources. See scripts for rebuild steps.\n';
fs.writeFileSync(output, `${banner}window.AWS_QUESTION_BANK = ${JSON.stringify(questions, null, 2)};\n`);

const counts = (key) => Object.fromEntries(
  [...new Set(questions.map((question) => question[key]))]
    .sort()
    .map((value) => [value, questions.filter((question) => question[key] === value).length]),
);
console.log(JSON.stringify({ questions: questions.length, duplicates: 0, topics: counts('topic'), examDomains: counts('examDomain') }, null, 2));
