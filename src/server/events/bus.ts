// server/events/bus.ts

import { queues } from '../queues/config';

export interface EventOptions {
  priority?: number; // 1 = Highest, 10 = Lowest. Default is 5.
}

export const EventBus = {
  publishJobCreated: async (jobId: string, payload: any, opts?: EventOptions) => {
    console.log(`[EventBus] Publishing JobCreated for ${jobId}`);
    await queues.download.add('download', { jobId, ...payload }, { 
      jobId, // Native deduplication
      priority: opts?.priority ?? 5 
    });
  },

  publishDownloadComplete: async (jobId: string, assetUrl: string, opts?: EventOptions) => {
    console.log(`[EventBus] Publishing DownloadComplete for ${jobId}`);
    await queues.transcript.add('transcribe', { jobId, assetUrl }, { 
      jobId, 
      priority: opts?.priority ?? 5 
    });
  },

  publishTranscriptReady: async (jobId: string, transcriptId: string, opts?: EventOptions) => {
    console.log(`[EventBus] Publishing TranscriptReady for ${jobId}`);
    await queues.analysis.add('analyze', { jobId, transcriptId }, { 
      jobId, 
      priority: opts?.priority ?? 5 
    });
  },

  publishAnalysisReady: async (jobId: string, suggestionIds: string[], opts?: EventOptions) => {
    console.log(`[EventBus] Publishing AnalysisReady for ${jobId}`);
    await queues.render.add('render', { jobId, suggestionIds }, { 
      jobId, 
      priority: opts?.priority ?? 5 
    });
  },

  publishRenderComplete: async (jobId: string, clipIds: string[], opts?: EventOptions) => {
    console.log(`[EventBus] Publishing RenderComplete for ${jobId}`);
    await queues.upload.add('upload', { jobId, clipIds }, { 
      jobId, 
      priority: opts?.priority ?? 5 
    });
  }
};
