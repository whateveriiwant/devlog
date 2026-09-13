import { ArrowRight } from 'lucide-react';
import { Item, ItemContent, ItemActions, ItemDescription } from './ui/item';
import { Badge } from './ui/badge';
export default function CollectionRows({
  rows,
  heading = 2,
}: {
  rows: { href: string; title: string; description: string; count: number }[];
  heading?: 2 | 3;
}) {
  const Heading = heading === 2 ? 'h2' : 'h3';
  return (
    <div className="divide-y">
      {rows.map((row) => (
        <Item
          key={row.href}
          asChild
          className="flex-nowrap rounded-none border-0 px-2 py-5"
        >
          <a href={row.href}>
            <ItemContent className="min-w-0">
              <Heading className="text-base leading-6 font-medium">
                {row.title}
              </Heading>
              <ItemDescription className="mt-1 text-sm leading-6">
                {row.description}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="shrink-0">
              <Badge variant="secondary">{row.count}개의 글</Badge>
              <ArrowRight className="size-4 text-muted-foreground" />
            </ItemActions>
          </a>
        </Item>
      ))}
    </div>
  );
}
