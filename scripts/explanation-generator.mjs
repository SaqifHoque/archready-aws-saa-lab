const SERVICE_FACTS = [
  [/\bCost Explorer\b/i, 'AWS Cost Explorer provides historical cost visualization, filtering, grouping, and usage analysis without requiring a custom reporting system.'],
  [/\bAWS Budgets?\b/i, 'AWS Budgets tracks actual and forecast spend or usage against configured thresholds and can send alerts or initiate budget actions.'],
  [/\bSavings Plans?\b/i, 'Savings Plans discount eligible steady compute usage in exchange for an hourly spending commitment, with coverage depending on the selected plan type.'],
  [/\bSpot Instances?\b/i, 'EC2 Spot Instances use spare AWS capacity at a steep discount and suit interruptible or fault-tolerant workloads.'],
  [/\bReserved Instances?\b/i, 'Reserved Instances can reduce cost for predictable long-running usage when their scope and attributes match the workload.'],
  [/\bS3 Glacier Deep Archive\b/i, 'S3 Glacier Deep Archive is designed for long-term retention at very low storage cost, with retrieval measured in hours rather than immediate access.'],
  [/\bS3 Intelligent-Tiering\b/i, 'S3 Intelligent-Tiering automatically moves objects between access tiers when access patterns change, without retrieval charges for its automatic tiers.'],
  [/\bS3 (?:Standard-IA|Standard Infrequent Access)\b/i, 'S3 Standard-IA keeps multi-Availability Zone durability and millisecond access while reducing storage cost for infrequently accessed objects.'],
  [/\b(?:Amazon )?S3\b/i, 'Amazon S3 provides highly durable, elastic object storage and integrates with lifecycle, event, replication, and access-control features.'],
  [/\b(?:Amazon )?EFS\b|Elastic File System/i, 'Amazon EFS provides a managed shared NFS file system that multiple compute instances can mount concurrently across Availability Zones.'],
  [/\bFSx for Lustre\b/i, 'Amazon FSx for Lustre provides the parallel, high-throughput file access required by high-performance computing and data-processing workloads.'],
  [/\bFSx for Windows/i, 'Amazon FSx for Windows File Server provides managed Windows file storage with native SMB and Active Directory integration.'],
  [/\b(?:Amazon )?EBS\b|Elastic Block Store/i, 'Amazon EBS provides persistent block storage for EC2, with snapshots, encryption, and volume types tuned for different IOPS and throughput needs.'],
  [/\bCloudFront\b/i, 'Amazon CloudFront caches content at edge locations, reducing origin load and latency for geographically distributed users.'],
  [/\bGlobal Accelerator\b/i, 'AWS Global Accelerator uses the AWS global network and static anycast IP addresses to route users to healthy regional endpoints with low latency.'],
  [/\bRoute 53\b/i, 'Amazon Route 53 provides managed DNS routing policies and health checks for latency routing, failover, and AWS alias targets.'],
  [/\bApplication Load Balancer|\bALB\b/i, 'An Application Load Balancer distributes HTTP and HTTPS traffic and supports content-based routing, TLS termination, health checks, and AWS WAF integration.'],
  [/\bNetwork Load Balancer|\bNLB\b/i, 'A Network Load Balancer handles high-throughput TCP, UDP, and TLS traffic with low latency and supports static IP addresses.'],
  [/\bAuto Scaling\b/i, 'EC2 Auto Scaling adjusts fleet capacity from health and demand signals and can distribute instances across multiple Availability Zones.'],
  [/\b(?:Amazon )?EC2\b/i, 'Amazon EC2 supplies resizable virtual-machine capacity, with purchasing, placement, storage, and networking options that can be matched to the workload.'],
  [/\b(?:AWS )?Lambda\b/i, 'AWS Lambda runs event-driven code without server management and scales execution with incoming events or requests.'],
  [/\bFargate\b/i, 'AWS Fargate runs containers without requiring the team to provision or maintain the underlying EC2 hosts.'],
  [/\b(?:Amazon )?ECS\b|Elastic Container Service/i, 'Amazon ECS provides managed container orchestration and can use either EC2 capacity or serverless AWS Fargate capacity.'],
  [/\b(?:Amazon )?EKS\b|Elastic Kubernetes Service/i, 'Amazon EKS provides a managed Kubernetes control plane and integrates Kubernetes workloads with AWS networking, identity, and observability.'],
  [/\bAurora\b/i, 'Amazon Aurora is a managed relational database with distributed storage, replicas, automated backups, and high-availability options.'],
  [/\b(?:Amazon )?RDS\b|Relational Database Service/i, 'Amazon RDS automates relational database provisioning, backups, patching, monitoring, and supported high-availability configurations.'],
  [/\bDynamoDB\b/i, 'Amazon DynamoDB is a managed key-value database that provides low-latency access and elastic capacity without database server administration.'],
  [/\bElastiCache\b/i, 'Amazon ElastiCache places frequently used data in an in-memory cache to reduce database load and read latency.'],
  [/\bRedshift\b/i, 'Amazon Redshift is a managed, columnar data warehouse optimized for large-scale analytical SQL workloads.'],
  [/\bAthena\b/i, 'Amazon Athena runs serverless SQL queries directly against data in Amazon S3, avoiding database infrastructure for ad hoc analysis.'],
  [/\b(?:AWS )?Glue\b/i, 'AWS Glue provides managed data discovery, cataloging, and ETL capabilities for analytics pipelines.'],
  [/\b(?:Amazon )?EMR\b|Elastic MapReduce/i, 'Amazon EMR provides managed big-data frameworks and supports elastic and Spot-based cluster capacity for batch analytics.'],
  [/\bKinesis Data Streams\b/i, 'Kinesis Data Streams durably ingests ordered real-time records and scales through shards or on-demand capacity.'],
  [/\bKinesis Data Firehose\b|Amazon Data Firehose/i, 'Amazon Data Firehose buffers, optionally transforms, and delivers streaming records to supported destinations with little infrastructure management.'],
  [/\b(?:Amazon )?SQS\b|Simple Queue Service/i, 'Amazon SQS durably buffers messages so producers and consumers can scale and fail independently.'],
  [/\b(?:Amazon )?SNS\b|Simple Notification Service/i, 'Amazon SNS provides managed publish/subscribe fanout to multiple subscribers and supported endpoints.'],
  [/\bEventBridge\b/i, 'Amazon EventBridge routes events between AWS services and applications using managed event buses, rules, and schedules.'],
  [/\bStep Functions\b/i, 'AWS Step Functions coordinates multi-step workflows with explicit state, retries, error handling, and service integrations.'],
  [/\bAPI Gateway\b/i, 'Amazon API Gateway provides a managed API front door with authorization, throttling, monitoring, and backend integrations.'],
  [/\b(?:AWS )?IAM\b|Identity and Access Management/i, 'AWS IAM policies and roles enforce authentication and least-privilege authorization without embedding long-term credentials in workloads.'],
  [/\bOrganizations\b|service control polic|\bSCP\b/i, 'AWS Organizations centralizes multi-account governance, while service control policies define permission guardrails for member accounts.'],
  [/\b(?:AWS )?KMS\b|Key Management Service/i, 'AWS KMS provides controlled, auditable encryption-key use and integrates with AWS services for encryption at rest.'],
  [/\bSecrets Manager\b/i, 'AWS Secrets Manager securely stores credentials and supports managed rotation so applications do not need hard-coded secrets.'],
  [/\bCertificate Manager|\bACM\b/i, 'AWS Certificate Manager provisions or imports TLS certificates and integrates them with supported AWS endpoints.'],
  [/\b(?:AWS )?WAF\b/i, 'AWS WAF filters HTTP and HTTPS requests using managed or custom web ACL rules before malicious traffic reaches the application.'],
  [/\bShield\b/i, 'AWS Shield provides managed protection against distributed denial-of-service attacks, with additional response features in Shield Advanced.'],
  [/\bGuardDuty\b/i, 'Amazon GuardDuty analyzes AWS telemetry to detect suspicious activity and produces findings without requiring security appliances.'],
  [/\bMacie\b/i, 'Amazon Macie discovers and classifies sensitive data in Amazon S3 and produces findings that can drive alerts or remediation.'],
  [/\bInspector\b/i, 'Amazon Inspector continuously assesses supported workloads and images for software vulnerabilities and unintended network exposure.'],
  [/\bCloudWatch\b/i, 'Amazon CloudWatch collects metrics and logs and can trigger alarms or automated actions when monitored conditions are met.'],
  [/\bCloudTrail\b/i, 'AWS CloudTrail records account API activity for auditing, investigation, and event-driven responses.'],
  [/\bAWS Config\b|\bConfig rule/i, 'AWS Config records resource configuration and evaluates managed or custom compliance rules, including automated remediation integrations.'],
  [/\bSystems Manager\b|Session Manager|Run Command/i, 'AWS Systems Manager provides managed fleet operations such as secure shell-free access, command execution, patching, and automation.'],
  [/\bDirect Connect\b/i, 'AWS Direct Connect supplies dedicated private connectivity from an external network to AWS with more consistent network performance than internet paths.'],
  [/\bSite-to-Site VPN\b|VPN connection/i, 'AWS Site-to-Site VPN provides encrypted connectivity over the internet and is commonly used as a primary or backup hybrid path.'],
  [/\bTransit Gateway\b/i, 'AWS Transit Gateway provides a central, transitive routing hub for connecting many VPCs and external networks.'],
  [/\bVPC endpoint\b|PrivateLink/i, 'A VPC endpoint keeps supported service traffic on private AWS networking without requiring an internet gateway or NAT path.'],
  [/\bNAT gateway\b/i, 'A NAT gateway gives private-subnet resources outbound connectivity without accepting unsolicited inbound internet connections.'],
  [/\bDatabase Migration Service|\bDMS\b/i, 'AWS DMS performs managed database migration and ongoing replication while minimizing source-database downtime.'],
  [/\bDataSync\b/i, 'AWS DataSync automates and accelerates online data transfer between supported storage systems with scheduling and integrity verification.'],
  [/\bSnowball\b|Snowmobile/i, 'AWS Snow Family devices move large datasets without consuming the organization’s available network bandwidth.'],
  [/\bStorage Gateway\b/i, 'AWS Storage Gateway presents familiar file, volume, or tape interfaces on premises while integrating data with AWS storage.'],
];

const REQUIREMENT_FACTS = [
  [/least (?:amount of )?operational overhead|minimal (?:administrative|management|operational)|fully managed/i, 'Using the managed integration reduces provisioning, maintenance, and custom orchestration.'],
  [/most cost-effective|least cost|reduce cost|lower cost|cost optim/i, 'The choice aligns billing and storage or compute capacity with the stated usage pattern instead of paying for unnecessary always-on capacity.'],
  [/highly available|high availability|fault toler|survive.*failure|failover/i, 'It removes a single point of failure and uses the availability or failover behavior required by the scenario.'],
  [/low latency|millisecond|performance|throughput|iops/i, 'Its access pattern and scaling characteristics fit the latency or throughput constraint in the question.'],
  [/scalab|unpredictable|spik|fluctuat|variable workload/i, 'The design can expand and contract with demand instead of relying on fixed peak capacity.'],
  [/secure|least privilege|encrypt|sensitive|private|compliance/i, 'It also meets the security boundary in the scenario through private access, encryption, or least-privilege controls as applicable.'],
  [/durab|retain|archive|recover|backup/i, 'Its durability and retention behavior matches the recovery or preservation requirement.'],
];

function sentence(value) {
  const clean = String(value || '').replace(/^[A-F][.)]\s*/, '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

export function generateExplanation(question) {
  const answer = String(question.answer || '');
  const scenario = String(question.question || '');
  const serviceFacts = [];
  for (const [pattern, fact] of SERVICE_FACTS) {
    if (pattern.test(answer) && !serviceFacts.includes(fact)) serviceFacts.push(fact);
    if (serviceFacts.length === 2) break;
  }
  if (!serviceFacts.length) {
    for (const [pattern, fact] of SERVICE_FACTS) {
      if (pattern.test(scenario) && !serviceFacts.includes(fact)) serviceFacts.push(fact);
      if (serviceFacts.length === 1) break;
    }
  }
  const requirementFacts = REQUIREMENT_FACTS
    .filter(([pattern]) => pattern.test(scenario))
    .slice(0, 2)
    .map(([, fact]) => fact);
  const selected = sentence(answer.split('\n')[0]);
  const lead = selected.length <= 260
    ? `The supplied correct choice is: ${selected}`
    : 'The supplied choices select the AWS design that directly satisfies the scenario’s stated constraints.';
  const facts = [...serviceFacts, ...requirementFacts];
  if (!facts.length) facts.push('The selected statement matches the AWS capability or service behavior being tested and directly addresses the requirement stated in the question.');
  return `${lead} ${facts.join(' ')}`.trim();
}

export function needsExplanation(question) {
  return !question.explanation
    || /no additional explanation was supplied|review the selected aws service/i.test(question.explanation);
}
