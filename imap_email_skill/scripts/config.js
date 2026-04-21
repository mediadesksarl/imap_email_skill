// config.js — loads .env from ~/.config/mediadesk-email/.env
// Falls back to .env in skill directory for backward compatibility

const fs = require('fs');
const path = require('path');
const os = require('os');

function loadConfig() {
  const globalConfig = path.join(os.homedir(), '.config', 'mediadesk-email', '.env');
  const localConfig = path.join(__dirname, '..', '.env');

  const configPath = fs.existsSync(globalConfig) ? globalConfig : localConfig;

  if (!fs.existsSync(configPath)) {
    console.error('No config found. Run: bash setup.sh');
    process.exit(1);
  }

  // Parse .env manually — no need for dotenv to avoid writing to process.env
  const lines = fs.readFileSync(configPath, 'utf8').split('\n');
  const config = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    config[key.trim()] = rest.join('=').trim();
  }

  return config;
}

module.exports = { loadConfig };
