'use client';
import { PlayCircle } from 'lucide-react';

// Drops into any Detailed Guide section. Pass videoUrl once a real video
// exists — that's the whole swap, no layout changes needed.
export default function VideoPlaceholder({ videoUrl, title }: { videoUrl?: string; title: string }) {
  if (videoUrl) {
    return (
      <div className="rounded-xl overflow-hidden border border-gray-200 bg-black aspect-video">
        <video src={videoUrl} controls className="w-full h-full" title={title} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 aspect-video text-gray-400">
      <PlayCircle size={32} strokeWidth={1.5} />
      <span className="text-xs font-semibold">Video coming soon</span>
    </div>
  );
}
