import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from './ui/breadcrumb';
export default function ArticleBreadcrumb({category,series}:{category:{name:string;href:string};series?:{name:string;href:string}}) {
  return <Breadcrumb aria-label="글의 위치"><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href={category.href}>{category.name}</BreadcrumbLink></BreadcrumbItem>{series&&<><BreadcrumbSeparator/><BreadcrumbItem><BreadcrumbLink href={series.href}>{series.name}</BreadcrumbLink></BreadcrumbItem></>}</BreadcrumbList></Breadcrumb>;
}
