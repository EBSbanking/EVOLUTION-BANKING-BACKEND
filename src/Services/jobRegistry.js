// src/services/jobRegistry.js
import cron from 'node-cron';

class JobRegistry {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Register a cron job
   * @param {string} name - Unique job name
   * @param {string} schedule - Cron expression
   * @param {Function} runFn - Async function to execute
   * @param {string} description - Human readable description
   */
  registerJob(name, schedule, runFn, description) {
    if (this.jobs.has(name)) {
      console.warn(`Job "${name}" already registered, skipping.`);
      return;
    }

    const job = {
      name,
      schedule,
      description,
      runFn,
      lastRun: null,
      status: 'idle', // idle | running | success | failed
      lastError: null,
      isRunning: false,
    };

    this.jobs.set(name, job);

    // Schedule the job using node-cron
    cron.schedule(schedule, async () => {
      job.isRunning = true;
      job.status = 'running';
      job.lastRun = new Date();
      try {
        await runFn();
        job.status = 'success';
        job.lastError = null;
      } catch (err) {
        job.status = 'failed';
        job.lastError = err.message;
      } finally {
        job.isRunning = false;
      }
    });

    console.log(`✅ Job "${name}" registered with schedule "${schedule}"`);
  }

  /** Get all jobs with status */
  getJobs() {
    const result = [];
    for (const [name, job] of this.jobs) {
      result.push({
        name,
        schedule: job.schedule,
        description: job.description,
        lastRun: job.lastRun,
        status: job.status,
        isRunning: job.isRunning,
        lastError: job.lastError,
      });
    }
    return result;
  }

  /** Manually run a job by name */
  async runJob(name) {
    const job = this.jobs.get(name);
    if (!job) throw new Error(`Job "${name}" not found`);
    if (job.isRunning) throw new Error(`Job "${name}" is already running`);

    job.isRunning = true;
    job.status = 'running';
    job.lastRun = new Date();
    try {
      await job.runFn();
      job.status = 'success';
      job.lastError = null;
      return { success: true, message: `Job "${name}" executed successfully` };
    } catch (err) {
      job.status = 'failed';
      job.lastError = err.message;
      throw err;
    } finally {
      job.isRunning = false;
    }
  }
}

export default new JobRegistry();