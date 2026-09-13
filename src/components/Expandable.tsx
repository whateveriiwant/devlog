import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function Expandable({
  title,
  count,
  defaultOpen = false,
  id,
  className = '',
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Heading = id ? 'h2' : 'div';
  useEffect(() => {
    if (!id) return;
    const reveal = () => {
      if (location.hash === `#${id}`) setOpen(true);
    };
    const click = (event: MouseEvent) => {
      if ((event.target as Element).closest(`a[href="#${id}"]`)) setOpen(true);
    };
    window.addEventListener('hashchange', reveal);
    document.addEventListener('click', click);
    reveal();
    return () => {
      window.removeEventListener('hashchange', reveal);
      document.removeEventListener('click', click);
    };
  }, [id]);
  return (
    <Collapsible
      id={id}
      open={open}
      onOpenChange={setOpen}
      className={className}
    >
      <Heading>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto w-full justify-between gap-3 border-b px-2 py-3 text-left"
          >
            <span className="flex items-center gap-3">
              <span
                className={
                  id ? 'text-xl font-semibold tabular-nums' : 'text-sm'
                }
              >
                {title}
              </span>
              {count !== undefined && (
                <Badge variant="secondary">{count}개의 글</Badge>
              )}
            </span>
            <ChevronDown
              className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </Button>
        </CollapsibleTrigger>
      </Heading>
      <CollapsibleContent
        forceMount
        className="pt-3 data-[state=closed]:hidden"
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
