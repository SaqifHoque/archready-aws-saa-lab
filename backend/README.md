# Optional AWS cloud sync backend

This SAM application provisions Cognito sign-in, an authenticated HTTP API, a Lambda progress handler, and encrypted DynamoDB storage. It is optional: the browser application continues to work with local storage or the local Docker backend when this stack is not deployed.

## Prerequisites

- AWS SAM CLI
- AWS credentials for an account where you are authorized to create Cognito, API Gateway, Lambda, and DynamoDB resources
- A unique lowercase Cognito domain prefix

## Deploy

Review the parameters carefully, then build and deploy:

```bash
sam build --template-file backend/template.yaml
sam deploy --guided
```

Use the deployed frontend origin and exact callback/logout URL during the guided deployment. Deployment creates real AWS resources and may incur charges.

## Connect the frontend

After deployment, use the API URL, Cognito domain, client ID, and public site URL from the stack outputs:

```bash
node scripts/configure-cloud.mjs \
  'https://API_ID.execute-api.REGION.amazonaws.com' \
  'https://YOUR_PREFIX.auth.REGION.amazoncognito.com' \
  'COGNITO_CLIENT_ID' \
  'https://study.example.com/'
```

This writes deployment-specific values to `cloud-config.js`. Review it before publishing, and redeploy the frontend after configuring it.

## Data retention

The DynamoDB table has server-side encryption, point-in-time recovery, and retain policies. Deleting the CloudFormation stack does not automatically remove the retained table; remove it manually only after exporting or intentionally discarding learner data.
