'use client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import LegalMarkdown from './LegalMarkdown';

export default function LegalPageChrome({
  title,
  lastUpdated,
  content,
}: {
  title: string;
  lastUpdated: string;
  content: string;
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#FFF8F1] p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl hover:bg-white/60 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={18} className="text-gray-500" />
          </button>
          <Image src="/logo.png" alt="bogie" width={1058} height={330} priority className="h-7 w-auto" />
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg shadow-gray-200/50 p-6 sm:p-10">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{title}</h1>
          <p className="text-xs text-gray-400 mb-8">Last updated: {lastUpdated}</p>
          <LegalMarkdown content={content} />
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          bogie Tracker · Aggarwal Publicity and Marketing Pvt. Ltd.
        </p>
      </div>
    </div>
  );
}
