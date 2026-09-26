document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-content-more]');
  if (!button || button.disabled) return;
  const list = button.parentElement.querySelector('[data-post-list]');
  const status = button.parentElement.querySelector('[data-content-status]');
  button.disabled = true;
  button.textContent = '불러오는 중…';
  try {
    const url = new URL(button.dataset.endpoint, location.origin);
    url.searchParams.set('cursor', button.dataset.cursor);
    const response = await fetch(url);
    if (!response.ok) throw new Error('다음 글을 불러오지 못했습니다.');
    const result = await response.json();
    const numbered = button.parentElement.hasAttribute('data-numbered');
    const start = list.children.length;
    for (const [index, post] of result.entries.entries()) {
      const li = document.createElement('li');
      li.dataset.publishedAt = post.published_at;
      const link = document.createElement('a');
      link.href = `/blog/${encodeURIComponent(post.slug)}/`;
      link.className = 'post-row group grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3 rounded-none px-2 py-4 transition-colors hover:bg-accent/60 md:grid-cols-[160px_minmax(0,1fr)] md:gap-4';
      const imageBox = document.createElement('div');
      imageBox.className = 'row-span-2 aspect-[5/3] self-center overflow-hidden rounded-md bg-muted';
      if (post.thumbnail) {
        const image = document.createElement('img');
        image.src = post.thumbnail;
        image.alt = '';
        image.loading = 'lazy';
        image.className = 'size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]';
        imageBox.append(image);
      }
      const content = document.createElement('div');
      content.className = 'min-w-0';
      const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' })
        .format(new Date(post.published_at)).replaceAll('-', '.');
      const indexLabel = document.createElement('div');
      indexLabel.className = 'post-row-index pt-0.5 text-xs text-muted-foreground tabular-nums';
      if (numbered) indexLabel.textContent = String(start + index + 1).padStart(2, '0');
      else {
        const time = document.createElement('time');
        time.dateTime = post.published_at;
        time.textContent = date;
        indexLabel.append(time);
      }
      const title = document.createElement('strong');
      title.className = 'block text-sm leading-6 font-medium wrap-anywhere';
      title.textContent = post.title;
      const details = document.createElement('div');
      details.className = 'mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground';
      const series = document.createElement('span');
      series.className = 'rounded-md bg-secondary px-2 py-0.5';
      series.textContent = post.series_name || '개별 기록';
      const tags = document.createElement('span');
      tags.textContent = (post.tags || []).slice(0, 3).join(' · ');
      details.append(series, tags);
      if (numbered) {
        const time = document.createElement('time');
        time.dateTime = post.published_at;
        time.textContent = date;
        details.append(time);
      }
      content.append(indexLabel, title, details);
      link.append(imageBox, content);
      li.append(link);
      list.append(li);
    }
    if (result.nextCursor) {
      button.dataset.cursor = result.nextCursor;
      button.disabled = false;
      button.textContent = '더 보기';
    } else button.remove();
    if (status) status.textContent = '';
  } catch (error) {
    button.disabled = false;
    button.textContent = '다시 시도';
    if (status) status.textContent = error instanceof Error ? error.message : '다음 글을 불러오지 못했습니다.';
  }
});
