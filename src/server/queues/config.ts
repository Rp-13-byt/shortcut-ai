// server/queues/config.ts

import { Queue, DefaultJobOptions, QueueEvents } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null, // Required by BullMQ for workers and events
};

// Advanced default options
const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000, 
  },
  removeOnComplete: {
    age: 3600 * 24 * 7, 
    count: 1000,
  },
  removeOnFail: {
    age: 3600 * 24 * 30,
  },
};

export const queueNames = {
  download: 'download-queue',
  transcript: 'transcript-queue',
  analysis: 'analysis-queue',
  render: 'render-queue',
  upload: 'upload-queue',
  dlq: 'dead-letter-queue', // Global DLQ
};

// Instantiating Queues
export const queues = {
  download: new Queue(queueNames.download, { connection, defaultJobOptions }),
  transcript: new Queue(queueNames.transcript, { connection, defaultJobOptions }),
  analysis: new Queue(queueNames.analysis, { connection, defaultJobOptions }),
  render: new Queue(queueNames.render, { connection, defaultJobOptions }),
  upload: new Queue(queueNames.upload, { connection, defaultJobOptions }),
  dlq: new Queue(queueNames.dlq, { connection, defaultJobOptions }),
};

// Dead Letter Queue & Telemetry Router
const setupEvents = () => {
  const allQueues = [queueNames.download, queueNames.transcript, queueNames.analysis, queueNames.render];
  
  for (const qName of allQueues) {
    const queueEvents = new QueueEvents(qName, { connection });
    
    // Telemetry: Queue Latency
    queueEvents.on('waiting', ({ jobId }) => {
      console.log(`[BullMQ:Telemetry] [${qName}] Job ${jobId} entered waiting queue`);
    });
    
    queueEvents.on('active', ({ jobId }) => {
      console.log(`[BullMQ:Telemetry] [${qName}] Job ${jobId} became active`);
    });

    queueEvents.on('stalled', ({ jobId }) => {
      console.warn(`[BullMQ:Telemetry] [${qName}] Job ${jobId} stalled! Potential worker crash or heavy CPU block.`);
    });

    // DLQ Router
    queueEvents.on('failed', async ({ jobId, failedReason }) => {
      console.error(`[BullMQ:DLQ] Job ${jobId} in ${qName} failed: ${failedReason}`);
      await queues.dlq.add('dead-letter', { originalQueue: qName, jobId, failedReason });
    });
  }
};

setupEvents();

export async function shutdownQueues() {
  console.log('[BullMQ] Closing queue connections...');
  const closePromises = Object.values(queues).map(q => q.close());
  await Promise.allSettled(closePromises);
  console.log('[BullMQ] Queue connections closed.');
}
