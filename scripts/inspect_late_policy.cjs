const fs = require('fs');
const { execSync } = require('child_process');

const cmd = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "docker exec hr-redis redis-cli get 'hr:settings:pharmacy-tracker-data'"`;
const raw = execSync(cmd, { maxBuffer: 100 * 1024 * 1024 }).toString();
const state = JSON.parse(raw);

const { getEffectiveLatePolicy } = require('../src/utils/latePenaltyEngine.js');
const policy = getEffectiveLatePolicy(state);
console.log('Tier 16-30:', JSON.stringify(policy.tiers[2], null, 2));
