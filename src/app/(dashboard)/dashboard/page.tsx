// app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useUIStore } from '@/lib/store';

export default function DashboardPage() {
  const [url, setUrl] = useState('');
  const [jobStage, setJobStage] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  
  const { activeJobId, setActiveJobId } = useUIStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    try {
      // Optimistic transition
      setJobStatus('QUEUED');
      setJobStage('DOWNLOAD');

      // Note: In a real implementation this uses TanStack React Query's `useMutation`
      const res = await fetch('/api/v1/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: url })
      });
      
      if (!res.ok) throw new Error('Failed to create job');
      const { data } = await res.json();
      setActiveJobId(data.id);
    } catch (err) {
      console.error(err);
      setJobStatus('FAILED');
    }
  };

  // SSE Subscription for real-time updates
  useEffect(() => {
    if (!activeJobId) return;

    const eventSource = new EventSource(`/api/v1/jobs/${activeJobId}/stream`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setJobStatus(data.status);
      setJobStage(data.stage);

      if (data.status === 'COMPLETED' || data.status === 'FAILED') {
        eventSource.close();
        setActiveJobId(null);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
      eventSource.close();
    };

    return () => eventSource.close();
  }, [activeJobId, setActiveJobId]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-4 mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white">
          Create Viral Shorts <br className="hidden md:block"/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            in Seconds.
          </span>
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          Paste a YouTube link below. Our AI will automatically transcribe, analyze hooks, and render 9:16 clips ready for TikTok and Reels.
        </p>
      </div>

      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
        <form onSubmit={handleSubmit} className="relative bg-slate-900 rounded-2xl p-2 flex flex-col md:flex-row items-center gap-2 border border-slate-800 shadow-2xl">
          <div className="flex-1 w-full relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <input 
              type="url" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..." 
              required
              disabled={jobStatus === 'PROCESSING' || jobStatus === 'QUEUED'}
              className="w-full bg-slate-950/50 text-white placeholder-slate-500 text-lg rounded-xl pl-12 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500/50 border border-transparent focus:border-purple-500/30 transition-all disabled:opacity-50"
            />
          </div>
          <button 
            type="submit" 
            disabled={jobStatus === 'PROCESSING' || jobStatus === 'QUEUED' || !url}
            className="w-full md:w-auto px-8 py-4 bg-white text-slate-950 font-bold text-lg rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Generate
          </button>
        </form>
      </div>

      {jobStatus && (
        <div className="mt-12 bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-white">Processing Video</h3>
            <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider ${
              jobStatus === 'COMPLETED' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 
              jobStatus === 'FAILED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
              'bg-purple-500/10 text-purple-400 border border-purple-500/20 animate-pulse'
            }`}>
              {jobStatus}
            </span>
          </div>

          <div className="space-y-6">
            {['DOWNLOAD', 'TRANSCRIBE', 'ANALYZE', 'RENDER', 'UPLOAD'].map((stage) => {
              const stages = ['DOWNLOAD', 'TRANSCRIBE', 'ANALYZE', 'RENDER', 'UPLOAD'];
              const currentIndex = stages.indexOf(jobStage || '');
              const thisIndex = stages.indexOf(stage);
              
              let statusText = 'Pending';
              let colorClass = 'text-slate-600 bg-slate-800 border-slate-700';
              
              if (jobStatus === 'COMPLETED' || thisIndex < currentIndex) {
                statusText = 'Completed';
                colorClass = 'text-green-400 bg-green-500/10 border-green-500/30';
              } else if (thisIndex === currentIndex && jobStatus !== 'FAILED') {
                statusText = 'Processing...';
                colorClass = 'text-purple-400 bg-purple-500/10 border-purple-500/30 ring-1 ring-purple-500/50';
              } else if (jobStatus === 'FAILED' && thisIndex === currentIndex) {
                statusText = 'Failed';
                colorClass = 'text-red-400 bg-red-500/10 border-red-500/30';
              }

              return (
                <div key={stage} className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${colorClass} transition-colors duration-500`}>
                    {statusText === 'Completed' ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-xs font-bold">{thisIndex + 1}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className={`font-medium transition-colors duration-500 ${thisIndex <= currentIndex ? 'text-white' : 'text-slate-500'}`}>
                      {stage.charAt(0) + stage.slice(1).toLowerCase()}
                    </h4>
                  </div>
                  <div className="text-sm font-medium w-24 text-right">
                    <span className={colorClass.split(' ')[0]}>{statusText}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
