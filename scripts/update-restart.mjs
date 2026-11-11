import { spawn } from 'node:child_process';
import process from 'node:process';

// 由「線上更新」呼叫：等舊進程結束後，用同一個 node 重新啟動 server.js
const pid = Number(process.argv[2] || 0);
const cwd = process.argv[3] || process.cwd();
const started = Date.now();

const alive = (p) => { try { process.kill(p, 0); return true; } catch (e) { return false; } };

const timer = setInterval(() => {
    const timedOut = Date.now() - started > 30000;
    if (!pid || !alive(pid) || timedOut) {
        clearInterval(timer);
        if (alive(pid) && pid !== process.pid) {
            try { process.kill(pid); } catch (e) {}
        }
        const child = spawn(process.execPath, ['server.js'], { cwd, detached: true, stdio: 'ignore', env: process.env });
        child.unref();
        process.exit(0);
    }
}, 400);
