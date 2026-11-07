/**
 * EduConnect Permanent Tunnel Watchdog & Keeper
 * 
 * Automatically maintains a persistent, zero-disconnect SSH tunnel (Pinggy / Cloudflare)
 * Auto-reconnects on network jitter, keeps TCP alive, updates current_pinggy_url.txt,
 * and syncs live tunnel URL to GitHub Gist registry so clients auto-reconnect without
 * requiring manual IP/URL entry.
 * 
 * Usage:
 *   node scripts/tunnel_keeper.js
 * Or with PM2:
 *   pm2 start scripts/tunnel_keeper.js --name "educonnect-tunnel"
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const GIST_ID = process.env.GIST_ID || 'dc4b18cafa978e951913e8b4b832d817';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GIST_TOKEN || '';
const PORT = process.env.PORT || 5000;
const HOME_DIR = process.env.HOME || path.resolve(__dirname, '..');
const TXT_PATH = path.join(HOME_DIR, 'current_pinggy_url.txt');
const LOG_PATH = path.join(HOME_DIR, 'pinggy.log');

let currentLiveUrl = '';
let isRestarting = false;

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[TunnelKeeper ${ts}] ${msg}`);
}

/**
 * Updates GitHub Gist registry with the newly acquired tunnel URL
 */
function updateGistRegistry(liveUrl) {
  if (!GITHUB_TOKEN) {
    log(`Notice: GITHUB_TOKEN not set in environment. Skipping Gist update. (Local URL saved: ${liveUrl})`);
    return;
  }

  const payload = JSON.stringify({
    description: 'EduConnect Live Tunnel Registry (Auto-updated)',
    files: {
      'tunnel.json': {
        content: JSON.stringify({
          url: liveUrl,
          api_url: `${liveUrl}/api/v1`,
          updated_at: new Date().toISOString(),
        }, null, 2),
      },
    },
  });

  const options = {
    hostname: 'api.github.com',
    port: 443,
    path: `/gists/${GIST_ID}`,
    method: 'PATCH',
    headers: {
      'User-Agent': 'EduConnect-Tunnel-Keeper',
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  const req = https.request(options, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      log(`✅ Cloud Gist registry successfully updated with new URL: ${liveUrl}`);
    } else {
      log(`⚠️ Failed to update Gist (Status ${res.statusCode})`);
    }
  });

  req.on('error', (e) => {
    log(`⚠️ Gist update network error: ${e.message}`);
  });

  req.write(payload);
  req.end();
}

/**
 * Saves live URL to disk and triggers registry sync
 */
function recordLiveUrl(url) {
  if (!url || url === currentLiveUrl) return;
  currentLiveUrl = url;
  log(`🚀 Live Tunnel established: ${url}`);

  try {
    fs.writeFileSync(TXT_PATH, url, 'utf8');
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${url}\n`, 'utf8');
  } catch (err) {
    log(`Notice: Could not write URL file: ${err.message}`);
  }

  updateGistRegistry(url);
}

/**
 * Spawns SSH Pinggy tunnel with robust keepalive parameters
 */
function startTunnel() {
  isRestarting = false;
  log('Starting persistent SSH tunnel...');

  // SSH with keepalive to prevent silent TCP drops:
  // - ServerAliveInterval: sends heartbeat packet every 15s
  // - ServerAliveCountMax: disconnects and restarts if 3 heartbeats go unacknowledged
  // - ExitOnForwardFailure: exits immediately on port conflict so watcher can retry
  // - StrictHostKeyChecking: avoids interactive prompts
  const sshArgs = [
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'TCPKeepAlive=yes',
    '-p', '443',
    `-R0:localhost:${PORT}`,
    'a.pinggy.io'
  ];

  const tunnel = spawn('ssh', sshArgs);

  const urlRegex = /https:\/\/[a-z0-9\-]+\.(run\.pinggy-free\.link|free\.pinggy\.net|pinggy\.link)/ig;

  tunnel.stdout.on('data', (data) => {
    const text = data.toString();
    const matches = text.match(urlRegex);
    if (matches && matches.length > 0) {
      recordLiveUrl(matches[0]);
    }
  });

  tunnel.stderr.on('data', (data) => {
    const text = data.toString();
    const matches = text.match(urlRegex);
    if (matches && matches.length > 0) {
      recordLiveUrl(matches[0]);
    }
  });

  tunnel.on('close', (code) => {
    log(`Tunnel process exited with code ${code}.`);
    reconnect();
  });

  tunnel.on('error', (err) => {
    log(`Tunnel process error: ${err.message}`);
    reconnect();
  });
}

function reconnect() {
  if (isRestarting) return;
  isRestarting = true;
  log('Reconnecting tunnel in 3 seconds...');
  setTimeout(() => {
    startTunnel();
  }, 3000);
}

// Start immediately
startTunnel();

// Process signal handling
process.on('SIGINT', () => {
  log('Stopping Tunnel Keeper...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  log('Stopping Tunnel Keeper...');
  process.exit(0);
});

