import Image from 'next/image';

export const dynamic = 'force-dynamic';

interface WordPressPost {
  id: number;
  slug: string;
  title: {
    rendered: string;
  };
  date: string;
  content: {
    rendered: string;
  };
  _embedded?: {
    'wp:featuredmedia'?: Array<{
      source_url: string;
    }>;
  };
}

export default async function PostPage({ params }: { params: { slug: string } }) {
  const res = await fetch(`https://api.coupiya.com/wordpress/wp-json/wp/v2/posts?slug=${params.slug}&_embed`);
  const posts: WordPressPost[] = await res.json();
  const post = posts[0];

  if (!post) return <div className="text-center text-red-500">文章未找到</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-4xl font-bold mb-4">{post.title.rendered}</h1>
      <div className="text-gray-500 mb-8">{new Date(post.date).toLocaleDateString('zh-CN')}</div>
      {post._embedded?.['wp:featuredmedia']?.[0]?.source_url && (
        <div className="relative w-full h-96 mb-8">
          <Image
            src={post._embedded['wp:featuredmedia'][0].source_url}
            alt={post.title.rendered}
            fill
            className="object-cover rounded-lg"
          />
        </div>
      )}
      <div className="prose prose-lg max-w-none" dangerouslySetInnerHTML={{ __html: post.content.rendered }} />
    </div>
  );
}