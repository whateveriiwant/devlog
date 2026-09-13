export {};

const tocLinks = Array.from(
  document.querySelectorAll<HTMLAnchorElement>('.desktop-toc a')
);
if (tocLinks.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!visible) return;
      tocLinks.forEach((link) => {
        const active =
          decodeURIComponent(link.hash.slice(1)) === visible.target.id;
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    },
    { rootMargin: '-90px 0px -65% 0px' }
  );
  document
    .querySelectorAll('.prose :is(h2,h3,h4,h5,h6)[id]')
    .forEach((h) => observer.observe(h));
}
