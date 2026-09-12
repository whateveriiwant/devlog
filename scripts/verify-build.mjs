import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeParse from 'rehype-parse';
import { visit } from 'unist-util-visit';
import { toString } from 'hast-util-to-string';

const root = path.resolve(import.meta.dirname,'..');
try { process.loadEnvFile(path.join(root,'.env')); } catch(error) { if(error.code!=='ENOENT') throw error; }
const dist = path.join(root,'dist');
const posts = JSON.parse(fs.readFileSync(path.join(root,'migration/velog-posts.json'),'utf8'));
const series = JSON.parse(fs.readFileSync(path.join(root,'migration/velog-series.json'),'utf8'));
const assets = new Map(JSON.parse(fs.readFileSync(path.join(root,'migration/image-manifest.json'),'utf8')).map(image=>[image.originalUrl,image.key]));
const mediaOrigin = process.env.MEDIA_BASE_URL?.replace(/\/$/,'');
const parser = unified().use(rehypeParse);
const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkRehype,{allowDangerousHtml:true}).use(rehypeRaw);
const cache = new Map(); const failures = []; const sourceLinkWarnings = [];
const treeFor = file => { if (!cache.has(file)) cache.set(file,parser.parse(fs.readFileSync(file,'utf8'))); return cache.get(file); };
const elements = (tree, predicate) => { const result=[]; visit(tree,'element',n=>{ if(predicate(n)) result.push(n); }); return result; };
const hasClass = (n,name) => n.properties.className?.includes(name);
const plain = value => value.replace(/\s+/g,' ').trim();
const signature = tree => ({
  headings:elements(tree,n=>/^h[1-6]$/.test(n.tagName)).map(n=>({depth:Number(n.tagName[1]),text:plain(toString(n))})),
  images:elements(tree,n=>n.tagName==='img').map(n=>String(n.properties.src)),
  code:elements(tree,n=>n.tagName==='pre').map(n=>toString(n)),
});
let images=0, headings=0, blocks=0, terminalNewlineDifferences=0;
for(const post of posts) {
  try {
    const file=path.join(dist,'blog',post.slug,'index.html');
    const tree=treeFor(file);
    const titles=elements(tree,n=>n.tagName==='h1');
    assert.equal(titles.length,1,'Exactly one page title');
    assert.equal(plain(toString(titles[0])),plain(post.title),'Rendered title');
    const prose=elements(tree,n=>hasClass(n,'prose'))[0];
    assert.ok(prose,'Article body');
    const expected=signature(markdown.runSync(markdown.parse(post.content)));
    const actual=signature(prose);
    if(expected.headings.some(h=>h.depth===1)) expected.headings=expected.headings.map(h=>({...h,depth:Math.min(6,h.depth+1)}));
    if(mediaOrigin) expected.images=expected.images.map(src=>assets.has(src)?`${mediaOrigin}/${assets.get(src)}`:src);
    assert.deepEqual(actual.headings,expected.headings,'Rendered headings and text');
    assert.deepEqual(actual.images,expected.images,'Rendered image count and mapped source URL');
    // Shiki and the baseline HTML renderer use different terminal LF conventions.
    // Compare all internal whitespace exactly; verify:migration checks the full raw bytes.
    const withoutTerminalLF = code => code.replace(/\n+$/,'');
    assert.deepEqual(actual.code.map(withoutTerminalLF),expected.code.map(withoutTerminalLF),'Rendered code, excluding terminal LF only');
    terminalNewlineDifferences+=actual.code.filter((code,i)=>code!==expected.code[i]).length;
    assert.equal(elements(tree,n=>Object.hasOwn(n.properties,'dataPagefindBody')).length,1,'Single searchable article');
    assert.equal(elements(tree,n=>n.tagName==='time' && n.properties.dateTime===post.publishedAt).length,1,'Publication timestamp');
    assert.equal(elements(prose,n=>['script','iframe','object','embed'].includes(n.tagName)).length,0,'No executable raw HTML');
    assert.equal(elements(prose,n=>Object.keys(n.properties).some(k=>/^on[A-Za-z]/.test(k))).length,0,'No raw event handlers');
    const ids=elements(tree,n=>typeof n.properties.id==='string').map(n=>n.properties.id);
    assert.equal(ids.length,new Set(ids).size,'Unique element IDs');
    images+=actual.images.length;headings+=actual.headings.length;blocks+=actual.code.length;
  } catch(error) { failures.push({post:post.title,error:error.message}); }
}
const htmlFiles=fs.readdirSync(dist,{recursive:true}).filter(file=>file.endsWith('.html')).map(file=>path.join(dist,file));
let checkedLinks=0;
for(const file of htmlFiles) {
  const tree=treeFor(file);
  const relative='/'+path.relative(dist,file).replace(/index.html$/,'');
  const prose=elements(tree,n=>hasClass(n,'prose'))[0];
  const originalLinks=new Set(prose ? elements(prose,n=>n.tagName==='a').map(n=>n.properties.href) : []);
  for(const link of elements(tree,n=>n.tagName==='a' && n.properties.href)) {
    try {
      const url=new URL(link.properties.href,'http://localhost'+relative);
      if(url.origin!=='http://localhost') continue;
      const pathname=decodeURIComponent(url.pathname);
      let target=path.resolve(dist,'.'+pathname);
      assert.ok(target.startsWith(dist+path.sep)||target===dist,'Local path remains under dist');
      if(pathname.endsWith('/')) target=path.join(target,'index.html');
      else if(fs.existsSync(target) && fs.statSync(target).isDirectory()) target=path.join(target,'index.html');
      assert.ok(fs.existsSync(target),`Missing target ${url.pathname}`);
      if(url.hash && target.endsWith('.html')) {
        const id=decodeURIComponent(url.hash.slice(1));
        assert.ok(elements(treeFor(target),n=>n.properties.id===id).length,`Missing fragment ${url.pathname}${url.hash}`);
      }
      checkedLinks++;
    } catch(error) {
      const record={file:path.relative(dist,file),href:link.properties.href,error:error.message};
      if(originalLinks.has(link.properties.href)) sourceLinkWarnings.push(record);else failures.push(record);
    }
  }
}
const archive=treeFor(path.join(dist,'archive/index.html'));
const list=elements(archive,n=>n.tagName==='main')[0];
const archived=elements(list,n=>n.tagName==='a' && hasClass(n,'post-row'));
try { assert.equal(archived.length,posts.length);assert.equal(new Set(archived.map(a=>a.properties.href)).size,posts.length); } catch(error) { failures.push({archive:error.message}); }
for(const s of series) {
  const tree=treeFor(path.join(dist,'series',s.url_slug,'index.html'));
  const main=elements(tree,n=>n.tagName==='main')[0];
  const links=elements(main,n=>n.tagName==='a' && hasClass(n,'post-row')).map(n=>n.properties.href);
  try {assert.deepEqual(links,s.posts.map(p=>`/blog/${encodeURIComponent(p.slug)}/`));} catch(error){failures.push({series:s.name,error:'Rendered order mismatch'});}
}
const result={verifiedAt:new Date().toISOString(),htmlPages:htmlFiles.length,articles:posts.length,articleHeadings:headings,articleImages:images,codeBlocks:blocks,codeComparison:'Exact text and internal whitespace; terminal LF normalized. Raw Markdown is separately SHA-256 verified.',terminalNewlineDifferences,internalLinksChecked:checkedLinks,archiveUniquePosts:archived.length,seriesChecked:series.length,sourceLinkWarnings,failures};
fs.writeFileSync(path.join(root,'migration/build-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(failures.length) process.exitCode=1;
