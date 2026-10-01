/**
 * 인증이 필요한 파일을 받아 새 창에서 보거나(preview) 내려받습니다.
 * 팝업 차단을 피하려고 받기 전에 창을 먼저 엽니다.
 */
export async function openProtectedFile(fetchBlob, fileName, preview) {
  const win = preview ? window.open('', '_blank') : null;
  try {
    const blob = await fetchBlob();
    const url = URL.createObjectURL(blob);
    if (win) {
      win.location.href = url;
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    win?.close();
    throw err;
  }
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
