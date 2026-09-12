import { ArrowUpRight } from 'lucide-react';
import { Item, ItemContent, ItemTitle, ItemDescription, ItemActions } from '@/components/ui/item';
import { Badge } from '@/components/ui/badge';
export interface Row {href:string;title:string;date:string;iso:string;series:string;tags:string[];thumbnail?:string}
export default function PostRows({rows,numbered=false,compact=false}:{rows:Row[];numbered?:boolean;compact?:boolean}) {
  return <ol className="m-0 list-none divide-y p-0">{rows.map((row,index)=><li key={row.href}>
    <Item asChild className={`rounded-none border-0 px-2 transition-colors hover:bg-accent/60 ${compact?'py-3':'py-4'}`}>
      <a href={row.href} className="post-row group grid grid-cols-[96px_minmax(0,1fr)_16px] items-start gap-3 md:grid-cols-[160px_minmax(0,1fr)_16px] md:gap-4">
        <div className="row-span-2 self-center aspect-[5/3] overflow-hidden rounded-md bg-muted">
          {row.thumbnail && <img src={row.thumbnail} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />}
        </div>
        <ItemContent className="min-w-0 gap-1.5"><div className="pt-0.5 text-xs text-muted-foreground tabular-nums">{numbered?String(index+1).padStart(2,'0'):<time dateTime={row.iso}>{row.date}</time>}</div><ItemTitle className="block text-sm leading-6 font-medium wrap-anywhere">{row.title}</ItemTitle>
        {!compact&&<ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"><Badge variant="secondary" className="rounded-md font-normal">{row.series}</Badge><span>{row.tags.slice(0,3).join(' · ')}</span>{numbered&&<time dateTime={row.iso}>{row.date}</time>}</ItemDescription>}</ItemContent>
        <ItemActions className="text-muted-foreground"><ArrowUpRight className="size-4 opacity-50 group-hover:opacity-100"/></ItemActions>
      </a>
    </Item>
  </li>)}</ol>;
}
