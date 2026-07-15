export class WorkerPool {
  constructor(workerUrl, poolSize = Math.max(1, (navigator.hardwareConcurrency || 4) - 1)) {
    this.workers = [];
    this.poolSize = poolSize;
    this.workerUrl = workerUrl;
    this.idleWorkers = [];
    this.tasks = [];
    this.results = [];
    this.totalTasks = 0;
    this.completedTasks = 0;
    this.onProgress = null;
    this.resolvePromise = null;
    this.rejectPromise = null;
    this.isInitialized = false;
    this.initPromises = [];
  }

  async init(initPayload) {
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(this.workerUrl, { type: 'module' });
      const initPromise = new Promise((resolve) => {
        // Temporary handler for initialization
        worker.onmessage = (e) => {
          if (e.data.type === 'init_done') {
            this.idleWorkers.push(worker);
            resolve();
          }
        };
      });
      worker.postMessage({ type: 'init', payload: initPayload });
      this.workers.push(worker);
      this.initPromises.push(initPromise);
    }
    await Promise.all(this.initPromises);
    this.isInitialized = true;
  }

  runTasks(tasks, onProgress) {
    if (!this.isInitialized) throw new Error("WorkerPool not initialized. Call init() first.");
    
    this.tasks = [...tasks];
    this.totalTasks = tasks.length;
    this.completedTasks = 0;
    this.results = [];
    this.onProgress = onProgress;

    return new Promise((resolve, reject) => {
      if (this.tasks.length === 0) {
        resolve([]);
        return;
      }
      
      this.resolvePromise = resolve;
      this.rejectPromise = reject;

      // Assign actual task handlers
      this.workers.forEach(worker => {
        worker.onmessage = (e) => {
          const { type, jobId, result, error, buyStrat, sellStrats } = e.data;
          
          if (type === 'result') {
            if (result && result.trades) {
              this.results.push({ buyStrat, sellStrats, result });
            }
          } else if (type === 'error') {
            console.error(`Worker error on job ${jobId}:`, error);
          }
          
          this.completedTasks++;
          if (this.onProgress) {
            this.onProgress(this.completedTasks, this.totalTasks);
          }

          this.idleWorkers.push(worker);
          this._assignTask();
        };
      });

      // Kickoff initial tasks
      while (this.idleWorkers.length > 0 && this.tasks.length > 0) {
        this._assignTask();
      }
    });
  }

  _assignTask() {
    if (this.tasks.length === 0) {
      // Check if completely done
      if (this.completedTasks === this.totalTasks && this.resolvePromise) {
        this.resolvePromise(this.results);
        this.resolvePromise = null;
      }
      return;
    }

    const worker = this.idleWorkers.pop();
    if (worker) {
      const task = this.tasks.shift();
      worker.postMessage({ type: 'run', payload: task });
    }
  }

  terminate() {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.idleWorkers = [];
    this.isInitialized = false;
  }
}
