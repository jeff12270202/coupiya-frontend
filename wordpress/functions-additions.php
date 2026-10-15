<?php
/**
 * ============================================================================
 * Coupiya 全球 UGC AI 影视平台 · WordPress functions.php 追加片段
 * ============================================================================
 * 安装：把本文件全部内容追加到主题 functions.php 末尾（或保存为
 *       wp-content/mu-plugins/coupiya-ugc.php 作为必须插件，推荐后者）。
 *
 * 内容：
 *   片段 A：把 publish-vod-movie 写入的 post meta 注册为 REST 可见字段
 *           （author_user_id / m3u8_url / poster_url / genre / source / coupiya_ref）
 *   片段 B：自定义 REST 接口 coupiya/v1/movies —— 按 author_user_id 服务端过滤，
 *           供个人中心「我的作品」与电影墙作者真名化使用。
 *
 * 依赖：movie 自定义文章类型（MAS Videos 或等价注册）、movie_genre 分类法。
 * ============================================================================
 */

/* ============================================================================
 * 片段 A：注册 movie 的 REST 元字段（SOP 46：author_user_id 等上墙元数据）
 * ========================================================================= */
add_action('init', function () {
    $meta_defs = [
        'author_user_id' => ['type' => 'integer', 'description' => 'Coupiya 网站创作者 ID'],
        'm3u8_url'       => ['type' => 'string',  'description' => '腾讯云 VOD HLS 播放地址'],
        'poster_url'     => ['type' => 'string',  'description' => '海报封面 URL'],
        'genre'          => ['type' => 'string',  'description' => '影片类型（冗余字段）'],
        'source'         => ['type' => 'string',  'description' => '来源：geek（极客空间）/ oneclick（一键生成）'],
        'coupiya_ref'    => ['type' => 'string',  'description' => '幂等参考键（requestId）'],
    ];
    foreach ($meta_defs as $key => $def) {
        register_post_meta('movie', $key, array_merge($def, [
            'single'           => true,
            'show_in_rest'     => true,
            'sanitize_callback' => $key === 'author_user_id' ? 'absint' : 'sanitize_text_field',
        ]));
    }
});

/* ============================================================================
 * 片段 B：coupiya/v1/movies —— 按作者服务端过滤（个人中心「我的作品」）
 * ========================================================================= */
add_action('rest_api_init', function () {
    register_rest_route('coupiya/v1', '/movies', [
        'methods'             => 'GET',
        'callback'            => function (WP_REST_Request $request) {
            $author = absint($request->get_param('author_user_id'));
            if (!$author) {
                return new WP_REST_Response(['items' => [], 'total' => 0], 200);
            }
            $per_page = min(max(absint($request->get_param('per_page') ?: 12), 1), 50);
            $page     = max(absint($request->get_param('page') ?: 1), 1);

            $query = new WP_Query([
                'post_type'      => 'movie',
                'post_status'    => 'publish',
                'posts_per_page' => $per_page,
                'paged'          => $page,
                'meta_key'       => 'author_user_id',
                'meta_value'     => $author,
                'meta_compare'   => '=',
                'no_found_rows'  => false, // 需要 found_posts 做总数
            ]);

            $items = [];
            foreach ($query->posts as $post) {
                $genre_terms = wp_get_post_terms($post->ID, 'movie_genre', ['fields' => 'names']);
                $items[] = [
                    'id'      => $post->ID,
                    'title'   => get_the_title($post),
                    'slug'    => $post->post_name,
                    'link'    => get_permalink($post),
                    'date'    => get_the_date('c', $post),
                    'poster'  => (string) (get_the_post_thumbnail_url($post->ID, 'medium') ?: ''),
                    'genre'   => $genre_terms && !is_wp_error($genre_terms) ? $genre_terms[0] : '',
                    'playUrl' => (string) get_post_meta($post->ID, 'm3u8_url', true),
                ];
            }

            return new WP_REST_Response(['items' => $items, 'total' => (int) $query->found_posts], 200);
        },
        'permission_callback' => '__return_true', // 公开只读（作品是公开内容）
    ]);
});
