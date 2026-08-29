import fs from 'node:fs';

const bankPath = process.argv[2] ?? 'data/questions.js';

const records = [
  ['A company mandates identity federation and role-based access control. Roles are already assigned through groups in its corporate Active Directory. Which services should the company use? (Choose two.)', ['IAM roles', 'AWS Directory Service AD Connector'], 'Security', 'IAM & Governance'],
  ['Which AWS service monitors API calls made to Amazon Redshift and provides secured audit and compliance data?', ['AWS CloudTrail'], 'Operations', 'Monitoring & Operations'],
  ['A company needs to monitor memory and disk utilization across multiple EC2 instances. What should a solutions architect do?', ['Install the CloudWatch agent on all EC2 instances to collect memory and disk utilization data, and view the custom metrics in Amazon CloudWatch'], 'Operations', 'Monitoring & Operations'],
  ['A company needs its Amazon RDS database to be accessed using credentials associated with EC2 instance profiles and short-lived authentication tokens instead of stored passwords. What should it enable?', ['Enable IAM database authentication'], 'Security', 'IAM & Governance'],
  ['A company needs detailed visibility into the processes and threads consuming CPU and memory on an Amazon RDS DB instance. What should it enable?', ['Enable Enhanced Monitoring in Amazon RDS'], 'Operations', 'Monitoring & Operations'],
  ['A startup uses Amazon RDS for a web application with low normal activity and sudden bursts after product announcements. It needs a globally accessible API that handles these bursts. Which solution should it use?', ['Create an API with Amazon API Gateway and use AWS Lambda to handle sudden traffic bursts'], 'Integration', 'Application Integration'],
  ['An audit team needs reports showing whether the AWS services a company uses meet common security and regulatory standards. Which service should provide the compliance documents?', ['Use AWS Artifact to access security reports and compliance-related documents'], 'Security', 'Security'],
  ['A Docker application on Amazon ECS heavily uses DynamoDB. How should the partition key be designed to distribute the workload evenly and use provisioned throughput efficiently?', ['Use partition keys with high-cardinality attributes that have many distinct values'], 'Databases', 'Databases'],
  ['A company needs single sign-on from its corporate AD or LDAP directory and must restrict each user to a designated folder in an S3 bucket. Which actions should it take? (Choose two.)', ['Set up a federation proxy or identity provider and use AWS STS to issue temporary credentials', 'Configure an IAM role and policy that restrict access to the designated S3 folder'], 'Security', 'IAM & Governance'],
  ['An S3 bucket will immediately receive more than 2,000 PUT requests and 3,500 GET requests per second at peak. What should a solutions architect do to ensure optimal performance?', ['Do nothing because Amazon S3 automatically manages performance at this request rate'], 'Storage', 'Storage'],
  ['A company wants to track AWS resource usage so it does not unexpectedly reach service quotas. Which automated actions should it take? (Choose two.)', ['Run a scheduled Lambda function that refreshes AWS Trusted Advisor service limit checks', 'Use an EventBridge rule with an Amazon SNS topic target for notifications'], 'Operations', 'Monitoring & Operations'],
  ['Windows EC2 instances require higher bandwidth, higher packet-per-second performance, and consistently lower inter-instance latency. What is the most cost-effective solution?', ['Enable enhanced networking with the Elastic Network Adapter on the EC2 instances'], 'Networking', 'Networking'],
  ['Which AWS service secures data at rest for encrypted Amazon EBS volumes?', ['AWS Key Management Service (AWS KMS)'], 'Security', 'Security'],
  ['Which statements are true for encrypted Amazon EBS volumes? (Choose two.)', ['Snapshots created from the volumes are automatically encrypted', 'Data moving between the volume and the EC2 instance is encrypted'], 'Storage', 'Storage'],
  ['EC2 instances use an IAM role to access DynamoDB. The company launches instances in a new AWS Region that require identical privileges. What should it do?', ['Assign the existing IAM role to the EC2 instances in the new Region'], 'Security', 'IAM & Governance'],
  ['A company hosts a website behind a public load balancer and manages its public DNS with Route 53. How should it configure the zone apex record?', ['Create an A record that is an alias to the load balancer DNS name'], 'Networking', 'Networking'],
  ['A user needs to establish an SSH connection from a home computer to an EC2 instance. Which network rules are required? (Choose two.)', ['Add a security group inbound rule that permits SSH from the home IP address', 'Add network ACL inbound and outbound rules that permit the required SSH traffic'], 'Networking', 'Networking'],
  ['An Amazon Aurora cluster has no Aurora Replica and is not using Aurora Serverless. What happens if the primary database instance fails?', ['Aurora attempts on a best-effort basis to create a replacement DB instance in the same Availability Zone'], 'Databases', 'Databases'],
  ['A company needs to scale aggregate throughput beyond the per-tunnel limit of Site-to-Site VPN connections. What should it do?', ['Attach multiple VPN tunnels to an ECMP-enabled AWS Transit Gateway'], 'Networking', 'Networking'],
  ['A company needs detailed ALB HTTP request data, client IP addresses, and network latency for traffic analysis, plus low-overhead troubleshooting for applications on ECS Anywhere. Which solution should it use?', ['Enable ALB access logs and integrate the ECS cluster with Amazon CloudWatch Application Insights'], 'Operations', 'Monitoring & Operations'],
  ['Developers must add supplemental resources beyond the standard serverless and container infrastructure templates defined by administrators. Which AWS service and feature should they use?', ['Use AWS Proton components and attach each component to the appropriate service instance'], 'Architecture', 'Architecture Patterns'],
  ['Which Route 53 alias record types can point a DNS name to an Application Load Balancer? (Choose two.)', ['An alias A record', 'An alias AAAA record'], 'Networking', 'Networking'],
  ['A company has one Direct Connect connection to a VPC. Which options increase connection fault tolerance? (Choose two.)', ['Establish a hardware VPN over the internet between the VPC and the on-premises network', 'Establish another Direct Connect connection and private virtual interface in the same AWS Region'], 'Networking', 'Networking'],
];

function loadBank(file) {
  const source = fs.readFileSync(file, 'utf8');
  const match = source.match(/window\.AWS_QUESTION_BANK\s*=\s*([\s\S]*);\s*$/);
  if (!match) throw new Error(`Could not parse ${file}`);
  return JSON.parse(match[1]);
}

function fingerprint(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function tokens(value) { return new Set(fingerprint(value).split(' ').filter((token) => token.length > 2)); }
function similarity(a, b) {
  const left = tokens(a); const right = tokens(b); let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  return common / (left.size + right.size - common || 1);
}

const existing = loadBank(bankPath).filter((question) => question.source !== 'review-resource');
const added = [];
const duplicates = [];

records.forEach(([question, answers, category, topic], index) => {
  const candidate = {
    id: 30001 + index,
    question,
    answer: answers.join('\n'),
    explanation: `The supplied review notes identify the following as the correct approach:\n${answers.map((answer) => `• ${answer}`).join('\n')}`,
    category,
    topic,
    selectionsRequired: answers.length,
    confidence: 'source',
    source: 'review-resource',
  };
  const pool = [...existing, ...added];
  const match = pool.find((item) => fingerprint(item.question) === fingerprint(question) || similarity(item.question, question) >= 0.94);
  if (match) duplicates.push({ id: candidate.id, matches: match.id });
  else added.push(candidate);
});

const merged = [...existing, ...added];
const banner = '// Generated from the supplied study bank and additional practice resources. See scripts for rebuild steps.\n';
fs.writeFileSync(bankPath, `${banner}window.AWS_QUESTION_BANK = ${JSON.stringify(merged, null, 2)};\n`);
console.log(`Review records considered: ${records.length}`);
console.log(`Added: ${added.length}; duplicates skipped: ${duplicates.length}`);
console.log(`Merged bank entries: ${merged.length}`);
if (duplicates.length) console.log('Duplicate matches:', JSON.stringify(duplicates));
