import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parse } from 'yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import rehypeParse from 'rehype-parse';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';

const root = path.resolve(import.meta.dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const posts = read('migration/velog-posts.json');
const series = read('migration/velog-series.json');
const collection = read('migration/collection.json');
const taxonomy = read('migration/taxonomy.json');
const structures = read('migration/content-structure.json');
const parser = unified().use(remarkParse).use(remarkGfm);
const html = unified().use(rehypeParse,{fragment:true});
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const features = body => {
  const values = {headings:[], images:[], code:[], html:[], links:[]};
  visit(parser.parse(body), node => {
    if (node.type === 'heading') values.headings.push([node.depth,toString(node)]);
    if (node.type === 'image') values.images.push([node.url,node.alt,node.title]);
    if (node.type === 'imageReference') values.images.push([node.identifier,node.alt,node.referenceType]);
    if (node.type === 'code') values.code.push([node.lang,node.meta,node.value]);
    if (node.type === 'link') values.links.push([node.url,node.title]);
    if (node.type === 'html') {
      values.html.push(node.value);
      visit(html.parse(node.value), 'element', element => {
        if (element.tagName === 'img') values.images.push(element.properties);
        if (/^h[1-6]$/.test(element.tagName)) values.headings.push([element.tagName,element.children]);
      });
    }
  });
  return values;
};
const membership = new Map(series.flatMap(s => s.posts.map(p => [p.id,{id:s.id,order:p.order}])));
const rows = [], failures = [];
const files = fs.readdirSync(path.join(root,'src/content/posts')).filter(f => /\.(md|mdx)$/.test(f));
// New authored posts may coexist later; this audit explicitly identifies the migrated subset.
for (const p of posts) {
  try {
    const raw = fs.readFileSync(path.join(root,`src/content/posts/${p.id}.md`),'utf8');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(match,'Missing frontmatter');
    const frontmatter = parse(match[1]); const body = raw.slice(match[0].length);
    assert.equal(hash(p.content),p.contentSha256,'Source snapshot hash');
    assert.equal(hash(body),p.contentSha256,'Destination body hash');
    for (const key of ['title','description','slug','publishedAt','updatedAt','originalUrl']) assert.equal(frontmatter[key],p[key],key);
    assert.deepEqual(frontmatter.tags,p.tags,'Original tags');
    assert.equal(frontmatter.thumbnail,p.thumbnail || undefined,'Thumbnail');
    assert.equal(frontmatter.category,taxonomy.postCategories[p.id],'Assigned category');
    assert.deepEqual(frontmatter.series,membership.get(p.id),'Series ID and exact source index');
    assert.equal(frontmatter.draft,false,'Publication state');
    const before = features(p.content); const after = features(body);
    assert.deepEqual(after,before,'Headings/images/code/languages/HTML/links');
    rows.push({id:p.id,title:p.title,status:'passed',sourceSha256:p.contentSha256,destinationSha256:hash(body),headings:[before.headings.length,after.headings.length],images:[before.images.length,after.images.length],codeBlocks:[before.code.length,after.code.length]});
  } catch(error) { failures.push({id:p.id,title:p.title,error:error.message}); }
}
const seriesRows = series.map(s => {
  const target = posts.filter(p => membership.get(p.id)?.id === s.id).sort((a,b) => membership.get(a.id).order-membership.get(b.id).order);
  try { assert.deepEqual(target.map(p=>p.id),s.posts.map(p=>p.id)); } catch(error) {failures.push({series:s.name,error:'Membership/order mismatch'});}
  return {name:s.name,listedCount:s.posts_count,publicCount:s.posts.length,migratedCount:target.length,orders:s.posts.map(p=>p.order)};
});
assert.equal(posts.length,collection.publicPostCount);
assert.equal(new Set(posts.map(p=>p.id)).size,posts.length);
assert.equal(new Set(posts.map(p=>p.slug)).size,posts.length);
assert.equal(rows.length+failures.filter(f=>f.id).length,posts.length);
const report = {verifiedAt:new Date().toISOString(),sourceSnapshotAt:collection.completedAt,publicPosts:collection.publicPostCount,markdownFiles:files.length,migratedPosts:rows.length,failedPosts:failures.filter(f=>f.id).length,extraAuthoredFiles:files.filter(f=>!posts.some(p=>`${p.id}.md`===f)),bodyPreservation:'UTF-8 SHA-256 equality',series:seriesRows,rows,failures};
fs.writeFileSync(path.join(root,'migration/verification.json'),JSON.stringify(report,null,2)+'\n');

const review = ['# 수동 확인이 필요한 원본 콘텐츠','', '이 목록은 자동 변환 실패 목록이 아니다. 원본은 재작성하지 않았으며, 읽기 편의·접근성 또는 원본 자체의 불일치에 대한 편집 검토 목록이다.','', '## 원본 시리즈 불일치','', '- 학교생활: 목록 4개 / 공개 상세 3개. 원래 index 1, 2, 4를 보존했다. 빠진 항목이 비공개인지 삭제된 것인지는 알 수 없다. I cannot verify this with the available tools.','', '## 공통 검토 사항','', '- R2 및 개인 도메인 미설정. 이미지 원본 URL의 HTTP 가용성과 업로드 성공은 아직 검증하지 않았다.', '- HTML의 안전한 태그·텍스트·이미지·width/height/align을 렌더링한다. 원본 inline style과 border 속성은 화면에서 허용하지 않는다. 원본 Markdown 파일에는 그대로 남아 있다.', '- 언어 미지정 코드에는 언어를 추측해서 추가하지 않았다. 화면에서만 기존 언어의 대소문자를 정규화한다.', '- 원본의 빈 alt는 임의의 사진 설명으로 대체하지 않았다.', '- 본문 h1이 있는 글만 렌더링 시 h1–h5를 한 단계 낮춘다. h2 이하로 시작하는 새 글은 그대로 표시하며 Markdown 파일의 heading은 변경하지 않는다.',''];
let reviewPosts = 0;
for (const p of posts) {
  const s = structures.find(s=>s.id===p.id); const notes = [];
  if (s.html.length) notes.push(`HTML ${s.html.length}개 조각: 사진 폭/표/줄바꿈 및 브라우저 HTML 보정 결과 확인.`);
  if (s.emptyAlt) notes.push(`본문 이미지 ${s.emptyAlt}개 참조에 alt 없음. 내용을 직접 보고 작성 권장.`);
  const missing = s.codeBlocks.filter(c=>!c.lang).length;
  if (missing) notes.push(`코드 블록 ${missing}개에 언어 표시 없음.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(p.description+p.content)) notes.push('원본에 제어 문자가 있음. 원본 데이터는 보존하고 SEO 설명에서는 표시 불가능한 제어 문자만 제외함.');
  if (/<h3>[^]*?<\/h2>/.test(p.content)) notes.push('h3를 h2로 닫은 잘못된 원본 HTML 있음. 본문 파일을 수정하지 않았음.');
  if (!membership.has(p.id)) notes.push('원본 시리즈 미소속. 새 시리즈 순서를 임의로 부여하지 않았음.');
  const relativeLinks=features(p.content).links.map(([url])=>url).filter(url=>!/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url));
  if(relativeLinks.length) notes.push(`상대 주소로 작성된 원본 링크: ${[...new Set(relativeLinks)].join(', ')}. 의도한 주소를 확인한 뒤 편집 필요.`);
  if (notes.length) { reviewPosts++;review.push(`## [${p.title.replaceAll(']','\\]')}](${p.originalUrl})`,'',...notes.map(n=>`- ${n}`),''); }
}
review.splice(4,0,`검토 표시가 있는 글: ${reviewPosts}/${posts.length}개. 세부 결과: verification.json.`, '');
fs.writeFileSync(path.join(root,'migration/manual-review.md'),review.join('\n')+'\n');
console.log(JSON.stringify({passed:rows.length,failed:failures.length,series:seriesRows.length,sourceHeadingCount:rows.reduce((n,r)=>n+r.headings[0],0),destinationHeadingCount:rows.reduce((n,r)=>n+r.headings[1],0),sourceImageCount:rows.reduce((n,r)=>n+r.images[0],0),destinationImageCount:rows.reduce((n,r)=>n+r.images[1],0),codeBlocks:rows.reduce((n,r)=>n+r.codeBlocks[0],0),reviewPosts,failures},null,2));
if (failures.length) process.exitCode=1;
