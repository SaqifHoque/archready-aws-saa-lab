// Original showcase practice questions, written for this project. Not real exam questions.
window.AWS_QUESTION_BANK = [
  {
    "id": 90001,
    "question": "A report generator runs on EC2 and reads one private S3 bucket. How should it obtain AWS credentials?",
    "answer": "Attach an IAM role to the instance with permission to read that bucket.",
    "options": [
      "Attach an IAM role to the instance with permission to read that bucket.",
      "Embed an access key in the application image.",
      "Share the root user access key.",
      "Make the bucket public."
    ],
    "explanation": "An instance role supplies temporary credentials and can be restricted to the required bucket.",
    "category": "Security",
    "topic": "IAM & Governance",
    "examDomain": "Design Secure Architectures",
    "selectionsRequired": 1,
    "confidence": "original-demo"
  },
  {
    "id": 90002,
    "question": "A support engineer needs to view resources without changing them. Which access model fits?",
    "answer": "Grant only the read actions needed for the support task.",
    "options": [
      "Grant only the read actions needed for the support task.",
      "Grant AdministratorAccess for convenience.",
      "Share another engineer’s password.",
      "Disable authorization checks."
    ],
    "explanation": "Least privilege limits allowed actions and resources to the task.",
    "category": "Security",
    "topic": "IAM & Governance",
    "examDomain": "Design Secure Architectures",
    "selectionsRequired": 1,
    "confidence": "original-demo"
  },
  {
    "id": 90003,
    "question": "A service needs its database password at runtime. Which approach supports central secret management?",
    "answer": "Read the secret from AWS Secrets Manager using the service role.",
    "options": [
      "Read the secret from AWS Secrets Manager using the service role.",
      "Commit the password to a public repository.",
      "Put the password in a public JavaScript file.",
      "Use one password hardcoded into every image."
    ],
    "explanation": "Secrets Manager stores secrets centrally; access is controlled with IAM. The service still needs an appropriate rotation design.",
    "category": "Security",
    "topic": "IAM & Governance",
    "examDomain": "Design Secure Architectures",
    "selectionsRequired": 1,
    "confidence": "original-demo"
  },
  {
    "id": 90004,
    "question": "A web service must survive the loss of one Availability Zone. Which deployment improves availability?",
    "answer": "Run instances across multiple Availability Zones behind a load balancer.",
    "options": [
      "Run instances across multiple Availability Zones behind a load balancer.",
      "Run all instances in one Availability Zone.",
      "Keep only one instance and disable monitoring.",
      "Store the only backup on the application instance."
    ],
    "explanation": "Multiple Availability Zones reduce dependence on a single zone. Application state and data also need a resilient design.",
    "category": "Compute",
    "topic": "High Availability & Resilience",
    "examDomain": "Design Resilient Architectures",
    "selectionsRequired": 1,
    "confidence": "original-demo"
  },
  {
    "id": 90005,
    "question": "Workers process uploaded documents, and traffic arrives in bursts. How can uploads be decoupled from processing?",
    "answer": "Place work messages in an SQS queue and let workers consume them.",
    "options": [
      "Place work messages in an SQS queue and let workers consume them.",
      "Require every browser to keep a worker connection open.",
      "Discard documents while workers are busy.",
      "Store pending jobs only in a browser tab."
    ],
    "explanation": "A queue buffers pending work. Consumers should handle retries and duplicate delivery appropriately.",
    "category": "Messaging",
    "topic": "Serverless & Integration",
    "examDomain": "Design Resilient Architectures",
    "selectionsRequired": 1,
    "confidence": "original-demo"
  },
  {
    "id": 90006,
    "question": "A database team needs recovery from accidental deletion of recent records. Which preparation is most relevant?",
    "answer": "Configure backups and point-in-time recovery, and test restoration.",
    "options": [
      "Configure backups and point-in-time recovery, and test restoration.",
      "Increase the database font size.",
      "Keep the only copy in a client cache.",
      "Remove all transaction logs."
    ],
    "explanation": "Availability replicas are not a replacement for a tested backup and recovery process.",
    "category": "Database",
    "topic": "Databases",
    "examDomain": "Design Resilient Architectures",
    "selectionsRequired": 1,
    "confidence": "original-demo"
  },
  {
    "id": 90007,
    "question": "A documentation site serves identical images to readers worldwide. Which service can cache those images near readers?",
    "answer": "Amazon CloudFront.",
    "options": [
      "Amazon CloudFront.",
      "AWS CloudTrail.",
      "AWS IAM.",
      "Amazon SQS."
    ],
    "explanation": "CloudFront is a content delivery network that caches eligible content at edge locations.",
    "category": "Networking",
    "topic": "Networking & Content Delivery",
    "examDomain": "Design High-Performing Architectures",
    "selectionsRequired": 1,
    "confidence": "original-demo"
  },
  {
    "id": 90008,
    "question": "A product API repeatedly reads the same catalog entries. Which layer can reduce repeated database reads?",
    "answer": "An application cache with an explicit expiry and invalidation strategy.",
    "options": [
      "An application cache with an explicit expiry and invalidation strategy.",
      "An audit log used as the primary database.",
      "A larger browser icon.",
      "Deleting all database indexes."
    ],
    "explanation": "Caching repeated reads can reduce latency and load. Stale data and cache misses still need deliberate handling.",
    "category": "Database",
    "topic": "Databases",
    "examDomain": "Design High-Performing Architectures",
    "selectionsRequired": 1,
    "confidence": "original-demo"
  },
  {
    "id": 90009,
    "question": "Several Linux application servers need shared file access to the same directory. Which AWS storage service is designed for managed shared file access?",
    "answer": "Amazon EFS.",
    "options": [
      "Amazon EFS.",
      "An instance-local temporary directory.",
      "Amazon SQS.",
      "AWS IAM."
    ],
    "explanation": "EFS provides managed NFS file storage that multiple clients can mount, subject to networking and access controls.",
    "category": "Storage",
    "topic": "Storage",
    "examDomain": "Design High-Performing Architectures",
    "selectionsRequired": 1,
    "confidence": "original-demo"
  },
  {
    "id": 90010,
    "question": "Reports must be retained for years but are rarely read, and retrieval can wait. What should be evaluated?",
    "answer": "An S3 lifecycle policy moving eligible reports to an archival storage class.",
    "options": [
      "An S3 lifecycle policy moving eligible reports to an archival storage class.",
      "Keeping every report only in RAM.",
      "Sending each report to every EC2 instance.",
      "Deleting reports before the retention period ends."
    ],
    "explanation": "Storage class selection must consider retrieval time, retrieval fees, minimum duration, and retention requirements.",
    "category": "Storage",
    "topic": "Storage",
    "examDomain": "Design Cost-Optimized Architectures",
    "selectionsRequired": 1,
    "confidence": "original-demo"
  },
  {
    "id": 90011,
    "question": "A batch job can restart safely after interruption. Which EC2 purchasing option may reduce compute cost?",
    "answer": "Spot Instances, with checkpointing and interruption handling.",
    "options": [
      "Spot Instances, with checkpointing and interruption handling.",
      "A larger On-Demand instance regardless of utilization.",
      "A dedicated host solely to store one text file.",
      "An unused instance running permanently."
    ],
    "explanation": "Spot capacity can be interrupted. Workloads must tolerate interruption and unavailable capacity.",
    "category": "Compute",
    "topic": "Compute",
    "examDomain": "Design Cost-Optimized Architectures",
    "selectionsRequired": 1,
    "confidence": "original-demo"
  },
  {
    "id": 90012,
    "question": "A development instance is needed only during working hours. Which operational change can reduce its compute charges?",
    "answer": "Schedule the instance to stop outside the required hours.",
    "options": [
      "Schedule the instance to stop outside the required hours.",
      "Leave the instance running while hiding its dashboard.",
      "Disable billing alerts to reduce usage.",
      "Rename the instance every evening."
    ],
    "explanation": "Stopping an eligible instance avoids running compute charges while it is stopped; attached storage and other resources may still incur charges.",
    "category": "Compute",
    "topic": "Compute",
    "examDomain": "Design Cost-Optimized Architectures",
    "selectionsRequired": 1,
    "confidence": "original-demo"
  }
];
