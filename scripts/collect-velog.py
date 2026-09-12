#!/usr/bin/env python3
"""Collect this author's public Velog content. Python stdlib + curl, no credentials.

Queries were inspected in public Velog JS on 2026-09-07. API-specific code lives
only here; migration and the site work from the saved JSON snapshot offline.
"""
import hashlib
import json
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'migration'
CACHE = ROOT / 'work' / 'responses'
USER = 'jsj9620'
V3 = 'https://v3.velog.io/graphql'
V2 = 'https://v2.velog.io/graphql'
QUERIES = {
    'posts': '''query velogPosts($input: GetPostsInput!) {
      posts(input: $input) { id title short_description thumbnail url_slug
      released_at updated_at tags is_private } }''',
    'tags': '''query userTags($input: UserTagsInput!) {
      userTags(input: $input) { posts_count tags { name posts_count } } }''',
    'seriesList': '''query getUserSeriesList($input: GetUserInput!) {
      user(input: $input) { series_list { id name description url_slug
      thumbnail updated_at posts_count } } }''',
    'post': '''query readPost($input: ReadPostInput!) {
      post(input: $input) { id title released_at updated_at body short_description
      is_markdown is_private is_temp thumbnail url_slug series { id name url_slug } } }''',
    'series': '''query Series($username: String, $url_slug: String) {
      series(username: $username, url_slug: $url_slug) { id name
      series_posts { id index post { id title url_slug released_at } } } }''',
}


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def request(name, variables, cache_key=None):
    cached = CACHE / f'{cache_key}.json' if cache_key else None
    if cached and cached.exists():
        return json.loads(cached.read_text())
    endpoint = V2 if name == 'series' else V3
    body = json.dumps({'query': QUERIES[name], 'variables': variables}).encode()
    for attempt in range(3):
        try:
            raw = subprocess.check_output(
                ['curl', '-sS', '--fail-with-body', '--max-time', '40', endpoint,
                 '-H', 'Content-Type: application/json', '--data-binary', '@-'], input=body)
            response = json.loads(raw)
            if response.get('errors') or not response.get('data'):
                raise RuntimeError(str(response))
            data = response['data']
            if cached:
                save(cached, data)
            return data
        except (subprocess.CalledProcessError, ValueError, RuntimeError):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def main():
    started = datetime.now(timezone.utc).isoformat()
    tags = request('tags', {'input': {'username': USER}})['userTags']
    series_list = request('seriesList', {'input': {'username': USER}})['user']['series_list']
    summaries, cursor, page_sizes = [], None, []
    while True:
        batch = request('posts', {'input': {'username': USER, 'limit': 20, 'cursor': cursor}})['posts']
        page_sizes.append(len(batch))
        if not batch:
            break
        known = {p['id'] for p in summaries}
        if any(p['id'] in known or p['is_private'] for p in batch):
            raise RuntimeError('Duplicate pagination or non-public post; stopped.')
        summaries.extend(batch)
        cursor = batch[-1]['id']
        print(f'Listed {len(summaries)}/{tags["posts_count"]}', flush=True)
    assert len(summaries) == tags['posts_count'], 'Public total and cursor enumeration disagree'

    def detail(summary):
        key = summary['id'] + '-' + hashlib.sha256(summary['updated_at'].encode()).hexdigest()[:12]
        p = request('post', {'input': {'username': USER, 'url_slug': summary['url_slug']}}, key)['post']
        assert p and p['id'] == summary['id'] and not p['is_private'] and not p['is_temp']
        return {
            'id': p['id'], 'title': p['title'], 'slug': p['url_slug'],
            'originalUrl': f'https://velog.io/@{USER}/{quote(p["url_slug"], safe="")}',
            'publishedAt': p['released_at'], 'updatedAt': p['updated_at'],
            'tags': summary['tags'], 'series': p['series'], 'thumbnail': p['thumbnail'],
            'description': p['short_description'] or '', 'content': p['body'],
            'isMarkdown': p['is_markdown'],
            'contentSha256': hashlib.sha256(p['body'].encode()).hexdigest(),
        }

    posts = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for p in pool.map(detail, summaries):
            posts.append(p)
            if len(posts) % 20 == 0:
                print(f'Read {len(posts)}/{len(summaries)}', flush=True)

    def series_detail(s):
        d = request('series', {'username': USER, 'url_slug': s['url_slug']})['series']
        assert d and d['id'] == s['id']
        members = sorted(d['series_posts'], key=lambda x: x['index'])
        return {**s, 'originalUrl': f'https://velog.io/@{USER}/series/{quote(s["url_slug"], safe="")}',
                'collectedCount': len(members),
                'posts': [{'id': m['post']['id'], 'title': m['post']['title'],
                           'slug': m['post']['url_slug'], 'order': m['index']} for m in members]}

    with ThreadPoolExecutor(max_workers=4) as pool:
        series = list(pool.map(series_detail, series_list))
    ids = {p['id'] for p in posts}
    discrepancies = [{'series': s['name'], 'listedCount': s['posts_count'],
                      'publicMemberCount': len(s['posts'])} for s in series if len(s['posts']) != s['posts_count']]
    missing_members = [{'series': s['name'], **p} for s in series for p in s['posts'] if p['id'] not in ids]
    save(OUT / 'velog-posts.json', posts)
    save(OUT / 'velog-series.json', series)
    save(OUT / 'velog-tags.json', tags)
    save(OUT / 'collection.json', {
        'startedAt': started, 'completedAt': datetime.now(timezone.utc).isoformat(),
        'username': USER, 'publicPostCount': tags['posts_count'], 'collectedPostCount': len(posts),
        'seriesCount': len(series), 'tagCount': len(tags['tags']), 'pageSizes': page_sizes,
        'exhaustedCursor': True, 'authenticated': False,
        'seriesCountDiscrepancies': discrepancies, 'membersMissingFromPublicPosts': missing_members,
        'sources': ['https://velog.io/@jsj9620/posts', 'https://velog.io/@jsj9620/series', V3, V2],
        'queries': QUERIES,
    })
    print(f'Saved {len(posts)} posts, {len(series)} series, {len(tags["tags"])} tags.')
    print(json.dumps({'seriesCountDiscrepancies': discrepancies, 'missingMembers': missing_members}, ensure_ascii=False))


if __name__ == '__main__':
    main()
