/* Decap custom media library. Authentication is an HttpOnly cookie on cms-api. */
(function () {
  const api = 'https://cms-api.seungjun.sh';
  let dialog;
  let insert;

  async function request(path, options = {}) {
    const response = await fetch(api + path, {
      credentials: 'include',
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(data.error || `요청 실패 (${response.status})`);
    return data;
  }

  async function optimizeImage(file) {
    if (!['image/jpeg', 'image/png'].includes(file.type)) return file;
    if (typeof createImageBitmap !== 'function') return file;

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return file;
    }
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 300_000) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const optimized = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.84)
    );
    if (!optimized || optimized.size >= file.size) return file;

    return new File([optimized], file.name.replace(/\.[^.]+$/, '.webp'), {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  }

  function close() {
    dialog?.remove();
    dialog = undefined;
  }

  function show() {
    close();
    dialog = document.createElement('dialog');
    dialog.style.cssText =
      'width:min(640px,95vw);max-height:85vh;border:1px solid #aaa;border-radius:8px;padding:20px';
    const heading = document.createElement('h2');
    heading.textContent = 'R2 이미지';
    const upload = document.createElement('input');
    upload.type = 'file';
    upload.accept = 'image/png,image/jpeg,image/webp,image/gif,image/avif';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const list = document.createElement('div');
    list.style.cssText =
      'display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;overflow:auto;max-height:55vh';
    const cancel = document.createElement('button');
    cancel.textContent = '닫기';
    cancel.addEventListener('click', close);
    upload.addEventListener('change', async () => {
      const file = upload.files?.[0];
      if (!file) return;
      upload.disabled = true;
      status.textContent = '이미지 용량을 줄이는 중…';
      try {
        const optimized = await optimizeImage(file);
        status.textContent = 'R2에 업로드 중…';
        const data = await request('/media', {
          method: 'POST',
          headers: { 'Content-Type': optimized.type },
          body: optimized,
        });
        insert(data.url);
        close();
      } catch (error) {
        status.textContent = error.message;
        upload.disabled = false;
      }
    });
    dialog.append(heading, upload, status, list, cancel);
    document.body.append(dialog);
    dialog.showModal();
    dialog.addEventListener('cancel', close);
    request('/media')
      .then(({ items }) => {
        for (const item of items) {
          const button = document.createElement('button');
          button.type = 'button';
          button.title = item.key;
          const image = document.createElement('img');
          image.src = item.url;
          image.alt = item.key;
          image.loading = 'lazy';
          image.style.cssText = 'width:100%;height:100px;object-fit:cover';
          button.append(image);
          button.addEventListener('click', () => {
            insert(item.url);
            close();
          });
          list.append(button);
        }
      })
      .catch((error) => {
        status.textContent = error.message;
      });
  }

  window.CMS_MANUAL_INIT = true;
  document.addEventListener('DOMContentLoaded', () => {
    CMS.registerMediaLibrary({
      name: 'r2',
      init({ handleInsert }) {
        insert = handleInsert;
        return {
          show,
          hide: close,
          onClearControl() {},
          onRemoveControl() {},
          enableStandalone: () => false,
        };
      },
    });
    window.initCMS();
  });
})();
