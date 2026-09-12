import { ArrowUpRight } from 'lucide-react';
import { Item, ItemContent, ItemTitle, ItemDescription, ItemActions } from '@/components/ui/item';
import { Badge } from '@/components/ui/badge';
export interface Row {href:string;title:string;date:string;iso:string;series:string;tags:string[]}
export default function PostRows({rows,numbered=false,compact=false}:{rows:Row[];numbered?:boolean;compact?:boolean}) {
  return <ol className="m-0 list-none divide-y p-0">{rows.map((row,index)=><li key={row.href}>
    <Item asChild className={`rounded-none border-0 px-2 transition-colors hover:bg-accent/60 ${compact?'py-3':'py-4'}`}>
      <a href={row.href} className="post-row group grid grid-cols-[minmax(0,1fr)_16px] gap-x-3 gap-y-1 md:grid-cols-[90px_minmax(0,1fr)_16px] md:gap-4">
        <div className="col-start-1 pt-0.5 text-xs text-muted-foreground tabular-nums">{numbered?String(index+1).padStart(2,'0'):<time dateTime={row.iso}>{row.date}</time>}</div>
        <ItemContent className="row-start-2 min-w-0 gap-1.5 md:row-auto"><ItemTitle className="block text-sm leading-6 font-medium wrap-anywhere">{row.title}</ItemTitle>
        {!compact&&<ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"><Badge variant="secondary" className="rounded-md font-normal">{row.series}</Badge><span>{row.tags.slice(0,3).join(' · ')}</span>{numbered&&<time dateTime={row.iso}>{row.date}</time>}</ItemDescription>}</ItemContent>
        <ItemActions className="col-start-2 row-start-2 text-muted-foreground md:col-auto md:row-auto"><ArrowUpRight className="size-4 opacity-50 group-hover:opacity-100"/></ItemActions>
      </a>
    </Item>
  </li>)}</ol>;
}
