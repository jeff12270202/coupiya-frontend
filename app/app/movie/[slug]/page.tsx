import { notFound } from 'next/navigation';
import Image from 'next/image';

export default async function MoviePage({ params }: { params: { slug: string } }) {
  const res = await fetch(`https://blog.coupiya.com/wp-json/wp/v2/movie?slug=${params.slug}&_embed`);
  if (!res.ok) return <div>加载中...</div>;
  const movies = await res.json();
  const movie = movies[0];
  if (!movie) return notFound();

  const posterUrl = movie._embedded?.['wp:featuredmedia']?.[0]?.source_url;
  const videoUrl = movie.meta?._sources ? movie.meta._sources : null; 
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-4">{movie.title.rendered}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="relative h-96 bg-gray-200 rounded-lg">
          {posterUrl && (
            <Image src={posterUrl} alt={movie.title.rendered} fill className="object-cover rounded-lg" />
          )}
        </div>
        <div>
          <div className="text-gray-500">{new Date(movie.date).toLocaleDateString('zh-CN')}</div>
          <div dangerouslySetInnerHTML={{ __html: movie.content?.rendered || '' }} />
          {/* 播放器就在这里！ */}
          {videoUrl && (
            <div className="mt-6 aspect-video bg-black rounded-lg overflow-hidden">
              <video src={videoUrl} controls className="w-full h-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}