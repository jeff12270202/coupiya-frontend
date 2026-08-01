'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

interface VideoFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function VideoFeedModal({ isOpen, onClose }: VideoFeedModalProps) {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 使用 Pexels 免费 API 获取海量视频数据
  useEffect(() => {
    if (!isOpen) return;
    const fetchVideos = async () => {
      setLoading(true);
      try {
        const res = await fetch('https://api.pexels.com/videos/popular?per_page=15', {
          headers: {
            // 替换为您自己的 Pexels API Key (免费注册即可获取)
            Authorization: '2TbWGew1wNxt1k2vAIS5689Fxb7u6QM3prJbsIvgRSogx7dAD7WzgwC6' 
          }
        });
        const data = await res.json();
        setVideos(data.videos || []);
      } catch (err) {
        console.warn('Pexels API 失败，使用内置演示视频:', err);
        setVideos([
          { id: 1, video_files: [{ link: 'https://www.w3schools.com/html/mov_bbb.mp4', quality: 'hd' }] },
          { id: 2, video_files: [{ link: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', quality: 'hd' }] },
          { id: 3, video_files: [{ link: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', quality: 'hd' }] },
          { id: 4, video_files: [{ link: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', quality: 'hd' }] },
          { id: 5, video_files: [{ link: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', quality: 'hd' }] },
        ]);
      } finally {
        setLoading(false);
      }
    };
    fetchVideos();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
      {/* 顶部关闭按钮 */}
      <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
        <XMarkIcon className="w-8 h-8" />
      </button>

      {/* 滑动视频容器 */}
      <div className="w-full h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide bg-black">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-white text-xl">🌍 加载视频流中...</div>
        ) : (
          videos.map((video, idx) => {
            const videoUrl = video.video_files?.find((f: any) => f.quality === 'hd' || f.quality === 'sd')?.link || video.video_files?.[0]?.link;
            return (
              <div key={video.id || idx} className="w-full h-[100vh] snap-start relative flex items-center justify-center bg-gray-900">
                <video
                  src={videoUrl}
                  className="w-full h-full object-cover"
                  controls
                  loop
                  autoPlay
                  muted={idx !== 0}
                  playsInline
                />
                
                <div className="absolute bottom-14 left-0 right-0 flex flex-row justify-center gap-6 items-center text-white/60 text-xs animate-pulse">
                  <ChevronUpIcon className="w-5 h-5" />
                  <span className="bg-black/30 px-3 py-1 rounded-full border border-white/20 font-medium tracking-wider">
                    滑动换视频
                  </span>
                  <ChevronDownIcon className="w-5 h-5" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}