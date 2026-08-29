import fs from 'node:fs';

const [apiUrl, cognitoDomain, clientId, siteUrl] = process.argv.slice(2);
if (![apiUrl, cognitoDomain, clientId, siteUrl].every(Boolean)) {
  console.error('Usage: node scripts/configure-cloud.mjs <api-url> <cognito-domain> <client-id> <site-url>');
  process.exit(1);
}

const normalizedSite = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
const config = `// Generated from the ArchReady cloud stack outputs.\nwindow.ARCHREADY_CLOUD = ${JSON.stringify({
  enabled: true,
  apiUrl: apiUrl.replace(/\/$/, ''),
  cognitoDomain: cognitoDomain.replace(/\/$/, ''),
  clientId,
  redirectUri: normalizedSite,
  logoutUri: normalizedSite,
}, null, 2)};\n`;

fs.writeFileSync('cloud-config.js', config);
console.log('Updated cloud-config.js. Upload the frontend again to enable account sync.');
