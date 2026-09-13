import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { NavSection } from '@/lib/navigation';
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
} from '@/components/ui/sidebar';

export default function NavigationPanel({
  sections,
}: {
  sections: NavSection[];
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <SidebarProvider className="min-h-0 w-full bg-transparent">
      <Sidebar collapsible="none" className="w-full bg-transparent">
        <SidebarContent className="gap-4 py-2">
          {sections.map((section) => {
            const initialCount = section.initialCount ?? section.items.length;
            const canExpand = section.items.length > initialCount;
            const isExpanded = expanded[section.label] ?? false;
            const visibleItems = isExpanded
              ? section.items
              : section.items.slice(0, initialCount);

            return (
            <SidebarGroup key={section.label} className="px-0">
              <SidebarGroupLabel className="mb-1 text-xs">
                {section.href ? (
                  <a href={section.href}>{section.label}</a>
                ) : (
                  section.label
                )}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={item.active}
                        className="h-auto min-h-9 items-start py-2 pr-10 [&>span:last-child]:whitespace-normal [&>span:last-child]:overflow-visible"
                      >
                        <a
                          href={item.href}
                          aria-current={item.active ? 'page' : undefined}
                        >
                          <span className="leading-5">{item.label}</span>
                        </a>
                      </SidebarMenuButton>
                      {item.count !== undefined && (
                        <SidebarMenuBadge className="top-2.5 text-[11px] font-normal text-muted-foreground">
                          {item.count}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ))}
                  {canExpand && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        type="button"
                        className="mt-1 text-muted-foreground"
                        onClick={() =>
                          setExpanded((current) => ({
                            ...current,
                            [section.label]: !isExpanded,
                          }))
                        }
                        aria-expanded={isExpanded}
                      >
                        <ChevronDown
                          className={`size-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                        <span>{isExpanded ? '시리즈 접기' : section.moreLabel}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            );
          })}
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}
