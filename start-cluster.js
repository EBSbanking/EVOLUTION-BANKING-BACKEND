// start-cluster.js
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

console.log('🚀 Starting cluster with staggered workers...');

// Start workers one by one with delays
const workers = [];

async function startWorker(port, delay) {
    await setTimeout(delay);
    console.log(`\n🔄 Starting worker on port ${port}...`);
    
    const worker = spawn('node', ['server.js'], {
        env: { ...process.env, PORT: port, WORKER_ID: port - 3001 },
        stdio: 'pipe'
    });
    
    worker.stdout.on('data', (data) => {
        console.log(`[Worker ${port}] ${data.toString().trim()}`);
    });
    
    worker.stderr.on('data', (data) => {
        console.error(`[Worker ${port} ERROR] ${data.toString().trim()}`);
    });
    
    worker.on('exit', (code) => {
        console.log(`❌ Worker on port ${port} exited with code ${code}`);
    });
    
    workers.push(worker);
    return worker;
}

// Start workers sequentially with 3-second delays
async function startCluster() {
    console.log('Killing any existing Node processes...');
    await spawn('taskkill', ['/F', '/IM', 'node.exe'], { stdio: 'ignore' });
    await setTimeout(5000);
    
    console.log('Starting workers...\n');
    
    await startWorker(3002, 1000);  // Start after 1 second
    await startWorker(3003, 4000);  // Start after 4 seconds
    await startWorker(3004, 7000);  // Start after 7 seconds
    await startWorker(3005, 10000); // Start after 10 seconds
    
    console.log('\n✅ All workers started!\n');
}

startCluster().catch(console.error);