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
  return (
    <SidebarProvider className="min-h-0 w-full bg-transparent">
      <Sidebar collapsible="none" className="w-full bg-transparent">
        <SidebarContent className="gap-4 py-2">
          {sections.map((section) => (
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
                  {section.items.map((item) => (
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
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}
