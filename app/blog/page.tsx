import Image from 'next/image';
import Link from 'next/link';

// 定义博客文章的类型
interface WordPressPost {
  id: number;
  slug: string;
  title: {
    rendered: string;
  };
  date: string;
  excerpt: {
    rendered: string;
  };
  _embedded?: {
    'wp:featuredmedia'?: Array<{
      source_url: string;
    }>;
  };
}

export default async function BlogPage() {
  const res = await fetch('https://api.coupiya.com/wordpress/wp-json/wp/v2/posts?_embed', {
    next: { revalidate: 60 },
  });
  const posts: WordPressPost[] = await res.json();

  return (
    <div>
      <h1 className="text-4xl font-bold mb-8 text-center">📖 博客 · 灵感库</h1>
      <div className="space-y-8">
        {posts.map((post) => (
          <article key={post.id} className="border-b pb-6">
            {post._embedded?.['wp:featuredmedia']?.[0]?.source_url && (
              <div className="relative w-full h-64 mb-4">
                <Image
                  src={post._embedded['wp:featuredmedia'][0].source_url}
                  alt={post.title.rendered}
                  fill
                  className="object-cover rounded-lg"
                />
              </div>
            )}
            <h2 className="text-2xl font-semibold hover:text-purple-600">
              <Link href={`/blog/${post.slug}`}>{post.title.rendered}</Link>
            </h2>
            <div className="text-gray-500 text-sm mt-1">
              {new Date(post.date).toLocaleDateString('zh-CN')}
            </div>
            <div
              className="prose prose-gray mt-3"
              dangerouslySetInnerHTML={{ __html: post.excerpt.rendered }}
            />
            <Link href={`/blog/${post.slug}`} className="inline-block mt-3 text-purple-600 font-medium">
              阅读更多 →
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}