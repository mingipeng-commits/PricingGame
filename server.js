const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT = 3000;

// In-memory game state shared between teacher and mobile clients
const gameState = {
    round: 0,
    segment: 0,
    roundName: '',
    numGroups: 8,
    prices: {},   // { "round-segment": { groupNum: price } }
    locked: {},   // { "round-segment": { groupNum: true } }
};

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.md': 'text/markdown; charset=utf-8',
};

function readBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => resolve(JSON.parse(body || '{}')));
    });
}

function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // ── API Routes ──
    if (url.pathname === '/api/ip') {
        return json(res, { ip: getLocalIP(), port: PORT });
    }

    if (url.pathname === '/api/state') {
        if (req.method === 'POST') {
            const data = await readBody(req);
            gameState.round = data.round;
            gameState.segment = data.segment;
            gameState.roundName = data.roundName || '';
            gameState.numGroups = data.numGroups || 8;
            return json(res, { ok: true });
        }
        return json(res, {
            round: gameState.round,
            segment: gameState.segment,
            roundName: gameState.roundName,
            numGroups: gameState.numGroups,
        });
    }

    if (url.pathname === '/api/price' && req.method === 'POST') {
        const data = await readBody(req);
        const key = `${data.round}-${data.segment}`;
        if (!gameState.prices[key]) gameState.prices[key] = {};
        if (!gameState.locked[key]) gameState.locked[key] = {};

        if (gameState.locked[key][data.group]) {
            return json(res, { error: '此組已送出定價，無法修改' }, 409);
        }

        gameState.prices[key][data.group] = data.price;
        gameState.locked[key][data.group] = true;
        return json(res, { ok: true });
    }

    if (url.pathname === '/api/prices') {
        const key = `${url.searchParams.get('round')}-${url.searchParams.get('segment')}`;
        return json(res, {
            prices: gameState.prices[key] || {},
            locked: gameState.locked[key] || {},
        });
    }

    if (url.pathname === '/api/reset' && req.method === 'POST') {
        gameState.prices = {};
        gameState.locked = {};
        return json(res, { ok: true });
    }

    // ── Static Files ──
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    filePath = path.join(__dirname, filePath);
    const ext = path.extname(filePath);

    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║       Pricing Game Server Started        ║');
    console.log('  ╠══════════════════════════════════════════╣');
    console.log(`  ║  Teacher:  http://localhost:${PORT}          ║`);
    console.log(`  ║  Network:  http://${ip}:${PORT}     ║`);
    console.log(`  ║  Mobile:   http://${ip}:${PORT}/mobile.html ║`);
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');

    // Auto-open browser unless --no-open flag is passed
    if (!process.argv.includes('--no-open')) {
        const url = `http://localhost:${PORT}`;
        const cmds = { darwin: `open "${url}"`, win32: `start "${url}"`, linux: `xdg-open "${url}"` };
        const cmd = cmds[process.platform];
        if (cmd) {
            exec(cmd, (err) => {
                if (err) console.log(`  請手動開啟瀏覽器：${url}`);
                else console.log('  瀏覽器已自動開啟');
            });
        }
    }
});
