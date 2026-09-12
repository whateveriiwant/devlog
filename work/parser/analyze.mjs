import fs from 'node:fs';
import crypto from 'node:crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import rehypeParse from 'rehype-parse';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import { toText } from 'hast-util-to-text';
const root = new URL('../../', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const write = (p,d) => fs.writeFileSync(new URL(p,root),JSON.stringify(d,null,2)+'\n');
const posts=read('migration/velog-posts.json');
const parser=unified().use(remarkParse).use(remarkGfm);
const htmlParser=unified().use(rehypeParse,{fragment:true});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const images=[];
const records=posts.map(p=>{
 const tree=parser.parse(p.content), headings=[], codeBlocks=[], html=[], links=[], definitions=new Map();
 visit(tree,'definition',n=>definitions.set(n.identifier,n));
 function image(url,alt,kind,line){
  const id=hash(url).slice(0,20), filename=decodeURIComponent(new URL(url,'https://velog.io').pathname.split('/').pop());
  const ext=filename.match(/\.(png|jpe?g|gif|webp|avif|svg)$/i)?.[0].toLowerCase()||'.img';
  images.push({sourcePost:p.id,sourceTitle:p.title,originalUrl:url,filename,alt:alt||'',kind,line,key:`velog/${id}${ext}`});
 }
 visit(tree,n=>{
  if(n.type==='heading')headings.push({depth:n.depth,text:toString(n),line:n.position.start.line});
  if(n.type==='code')codeBlocks.push({lang:n.lang||'',meta:n.meta||'',sha256:hash(n.value),line:n.position.start.line});
  if(n.type==='image')image(n.url,n.alt,'markdown',n.position.start.line);
  if(n.type==='imageReference'){const d=definitions.get(n.identifier);if(d)image(d.url,n.alt,'reference',n.position.start.line)}
  if(n.type==='link')links.push(n.url);
  if(n.type==='html'){
   html.push({line:n.position.start.line,value:n.value});
   visit(htmlParser.parse(n.value),'element',h=>{
    if(h.tagName==='img'&&h.properties.src)image(String(h.properties.src),String(h.properties.alt||''),'html',n.position.start.line);
    if(/^h[1-6]$/.test(h.tagName))headings.push({depth:Number(h.tagName[1]),text:toText(h),line:n.position.start.line,html:true});
    if(h.tagName==='a'&&h.properties.href)links.push(String(h.properties.href));
   });
  }
 });
 if(p.thumbnail)image(p.thumbnail,'','thumbnail',null);
 headings.sort((a,b)=>a.line-b.line);
 const bodyImages=images.filter(i=>i.sourcePost===p.id&&i.kind!=='thumbnail');
 return {id:p.id,title:p.title,slug:p.slug,characters:p.content.length,headings,codeBlocks,html,links,images:bodyImages.length,emptyAlt:bodyImages.filter(i=>!i.alt).length,unclosedFence:false};
});
const count=items=>Object.fromEntries([...items.reduce((m,k)=>m.set(k,(m.get(k)||0)+1),new Map())].sort((a,b)=>b[1]-a[1]));
const date=p=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(p.publishedAt));
const chars=records.map(r=>r.characters).sort((a,b)=>a-b);
const stats={posts:posts.length,series:read('migration/velog-series.json').length,tags:count(posts.flatMap(p=>p.tags)),years:count(posts.map(p=>date(p).slice(0,4))),months:count(posts.map(p=>date(p).slice(0,7))),headings:count(records.flatMap(r=>r.headings.map(h=>h.depth))),noHeadings:records.filter(r=>!r.headings.length).length,htmlPosts:records.filter(r=>r.html.length).length,htmlTags:count(records.flatMap(r=>r.html.flatMap(h=>[...h.value.matchAll(/<([a-z][a-z0-9]*)\b/gi)].map(m=>m[1].toLowerCase())))),images:images.filter(i=>i.kind!=='thumbnail').length,uniqueImages:new Set(images.map(i=>i.originalUrl)).size,imageReferencesWithThumbnails:images.length,emptyAlt:images.filter(i=>i.kind!=='thumbnail'&&!i.alt).length,codeBlocks:records.reduce((n,r)=>n+r.codeBlocks.length,0),codeLanguages:count(records.flatMap(r=>r.codeBlocks.map(c=>c.lang||'(unspecified)'))),characters:{min:chars[0],median:chars[Math.floor(chars.length/2)],max:chars.at(-1),shortUnder1000:chars.filter(n=>n<1000).length,medium1000to4999:chars.filter(n=>n>=1000&&n<5000).length,long5000plus:chars.filter(n=>n>=5000).length},imageHeavy:[...records].sort((a,b)=>b.images-a.images).slice(0,8).map(r=>({title:r.title,count:r.images})),codeHeavy:[...records].sort((a,b)=>b.codeBlocks.length-a.codeBlocks.length).slice(0,8).map(r=>({title:r.title,count:r.codeBlocks.length}))};
write('migration/content-structure.json',records);write('migration/image-manifest.json',images);write('migration/statistics.json',stats);
console.log(JSON.stringify(stats,null,2));
console.log('HTML POSTS',JSON.stringify(records.filter(r=>r.html.length).map(r=>({title:r.title,html:r.html.map(h=>h.value.slice(0,100))})),null,2));
