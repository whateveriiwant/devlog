import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Menu, Moon, Search, Sun } from 'lucide-react';
import { Button } from './ui/button';
import { Kbd } from './ui/kbd';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog';
import { Command, CommandInput, CommandItem, CommandList } from './ui/command';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import NavigationPanel from './NavigationPanel';
import type { NavSection } from '../lib/navigation';

interface SearchData { url: string; plain_excerpt?: string; meta: Record<string,string> }
interface SearchIndex { search(query:string):Promise<{results:{data():Promise<SearchData>}[]}> }
let index: Promise<SearchIndex> | undefined;
function getIndex(): Promise<SearchIndex> {
  const path = '/pagefind/pagefind.js';
  return index ??= import(/* @vite-ignore */ path).catch(error => { index=undefined; throw error; });
}
function excerpt(data:SearchData) {
  if (data.meta.description) return data.meta.description;
  const el=document.createElement('textarea'); el.innerHTML=data.plain_excerpt||''; return el.value;
}
export default function SiteControls({sections}:{sections:NavSection[]}) {
  const [open,setOpen]=useState(false), [menu,setMenu]=useState(false);
  const [query,setQuery]=useState(''), [limit,setLimit]=useState(12);
  const [results,setResults]=useState<SearchData[]>([]), [total,setTotal]=useState(0);
  const [status,setStatus]=useState('모든 글의 제목과 본문을 검색합니다.');
  const [photo,setPhoto]=useState<{src:string;alt:string;caption:string}|null>(null);
  const [dark,setDark]=useState(false);
  const searchFocus=useRef<HTMLElement|null>(null), imageFocus=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    setDark(document.documentElement.classList.contains('dark'));
    const media=matchMedia('(prefers-color-scheme: dark)');
    const systemTheme=()=>{try{if(localStorage.getItem('theme'))return;}catch{} applyTheme(media.matches);};
    const key=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&!event.isComposing){event.preventDefault();if(!document.querySelector('[role="dialog"]')){searchFocus.current=document.activeElement as HTMLElement;setOpen(true);}}};
    document.querySelectorAll<HTMLImageElement>('.prose img').forEach(img=>{
      if(img.closest('a,button'))return;
      const button=document.createElement('button');button.type='button';button.className='image-zoom';
      const width=img.getAttribute('width');if(width&&/^\d+(\.\d+)?%$/.test(width)){button.style.width=width;img.style.width='100%';}
      button.setAttribute('aria-label',img.alt?`${img.alt} 확대 보기`:'이미지 확대 보기');img.before(button);button.append(img);
    });
    const click=(event:MouseEvent)=>{
      if(!(event.target instanceof Element))return;
      const search=event.target.closest<HTMLElement>('[data-search-open]');
      if(search){searchFocus.current=search;setOpen(true);}
      const button=event.target.closest<HTMLButtonElement>('.image-zoom');
      const img=button?.querySelector('img');
      if(img&&button){imageFocus.current=button;setPhoto({src:img.currentSrc||img.src,alt:img.alt,caption:img.closest('figure')?.querySelector('figcaption')?.textContent||img.alt});}
    };
    document.addEventListener('keydown',key);document.addEventListener('click',click);media.addEventListener('change',systemTheme);
    return()=>{document.removeEventListener('keydown',key);document.removeEventListener('click',click);media.removeEventListener('change',systemTheme);};
  },[]);
  function applyTheme(value:boolean){document.documentElement.classList.toggle('dark',value);document.documentElement.dataset.theme=value?'dark':'light';setDark(value);}
  function toggleTheme(){const next=!document.documentElement.classList.contains('dark');applyTheme(next);try{localStorage.setItem('theme',next?'dark':'light');}catch{}}
  useEffect(()=>{
    if(!open)return;
    let cancelled=false;
    setResults([]);setTotal(0);
    if(!query.trim()){setStatus('모든 글의 제목과 본문을 검색합니다.');return;}
    setStatus('검색하고 있습니다…');
    const timer=setTimeout(async()=>{
      try{
        const response=await(await getIndex()).search(query.trim());
        const items=await Promise.all(response.results.slice(0,limit).map(hit=>hit.data()));
        if(cancelled)return;
        setResults(items.filter(item=>new URL(item.url,location.origin).origin===location.origin));setTotal(response.results.length);
        setStatus(response.results.length?`${response.results.length}개의 글을 찾았습니다.`:'일치하는 글이 없습니다. 다른 단어로 검색해 보세요.');
      }catch{if(!cancelled)setStatus('검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');}
    },140);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[query,limit,open]);
  return <div className="ml-auto flex shrink-0 items-center gap-1.5">
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="w-9 px-0 text-muted-foreground sm:w-44 sm:justify-start sm:px-3" aria-label="전체 글 검색" onClick={()=>{searchFocus.current=null;}}><Search/><span className="hidden sm:inline">글 검색</span><Kbd className="ml-auto hidden sm:inline-flex">⌘ K</Kbd></Button></DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl" onCloseAutoFocus={event=>{if(searchFocus.current){event.preventDefault();searchFocus.current.focus();}}}>
        <DialogTitle className="sr-only">전체 글 검색</DialogTitle>
        <DialogDescription className="sr-only">제목과 본문에서 검색합니다. 화살표 키로 결과를 선택하고 Enter로 열 수 있습니다.</DialogDescription>
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={value=>{setQuery(value);setLimit(12);}} placeholder="개념, 기술, 기억나는 문장…" aria-label="검색어" className="pr-10"/>
          <p className="px-4 py-3 text-xs text-muted-foreground" role="status" aria-live="polite">{status}</p>
          <CommandList className="max-h-[55dvh] px-2 pb-2">
            {results.map(data=><CommandItem key={data.url} value={data.url} asChild onSelect={()=>location.assign(data.url)} className="flex-col items-start gap-2 p-3">
              <a href={data.url}><span className="font-medium leading-6">{data.meta.title}</span><span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="secondary">{data.meta.category}</Badge>{data.meta.series}{data.meta.publishedAt&&<time dateTime={data.meta.publishedAt}>{new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(data.meta.publishedAt))}</time>}</span><span className="line-clamp-2 text-xs leading-5 text-muted-foreground">{excerpt(data)}</span>{data.meta.tags&&<span className="line-clamp-1 text-xs text-muted-foreground">{data.meta.tags}</span>}</a>
            </CommandItem>)}
          </CommandList>
          {total>results.length&&<Button variant="ghost" className="m-2" onClick={()=>setLimit(value=>value+12)}>결과 더 보기</Button>}
        </Command>
        <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3 text-xs text-muted-foreground"><span>↑ ↓ 이동 · Enter 열기</span><span><Kbd>Esc</Kbd> 닫기</span></div>
      </DialogContent>
    </Dialog>
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={`${dark?'라이트':'다크'} 모드로 전환`} title="테마 전환"><Sun className="hidden dark:block"/><Moon className="dark:hidden"/></Button>
    <Button variant="ghost" size="sm" asChild className="hidden lg:inline-flex"><a href="https://github.com/whateveriiwant" aria-label="GitHub 프로필" target="_blank" rel="noopener noreferrer">GitHub <ArrowUpRight/></a></Button>
    <Sheet open={menu} onOpenChange={setMenu}>
      <SheetTrigger asChild><Button variant="ghost" size="icon" className="md:hidden" aria-label="탐색 메뉴 열기"><Menu/></Button></SheetTrigger>
      <SheetContent side="left" className="gap-0"><SheetHeader className="border-b p-5"><SheetTitle>seungjun.dev</SheetTitle><SheetDescription>주제와 시리즈로 기록 찾기</SheetDescription></SheetHeader><div className="overflow-y-auto p-3"><NavigationPanel sections={sections}/></div></SheetContent>
    </Sheet>
    <Dialog open={Boolean(photo)} onOpenChange={value=>{if(!value)setPhoto(null);}}>
      <DialogContent className="max-h-[95dvh] overflow-auto sm:max-w-[90vw]" onCloseAutoFocus={event=>{event.preventDefault();imageFocus.current?.focus();}}>
        <DialogTitle className="sr-only">이미지 확대 보기</DialogTitle>
        {photo&&<img src={photo.src} alt={photo.alt} className="mx-auto max-h-[78dvh] max-w-full rounded-md object-contain"/>}
        <DialogDescription className={photo?.caption?'text-center':'sr-only'}>{photo?.caption||'본문 이미지의 확대 보기입니다.'}</DialogDescription>
      </DialogContent>
    </Dialog>
  </div>;
}
