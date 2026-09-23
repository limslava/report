/**
 * Файл с сервера: сначала получаем, потом отдаём браузеру. Системное окно «Сохранить как»
 * (showSaveFilePicker) не используем — в Arc и Chrome на macOS оно то не открывается,
 * то зависает. Куда класть файл, решает браузер: «Загрузки» или свой диалог, если в его
 * настройках включено «Всегда спрашивать, куда сохранять файлы».
 */
export async function saveFileWithPicker(suggestedName: string, load: () => Promise<Blob>): Promise<'saved' | 'cancelled'> {
  await downloadBlob(await load(), suggestedName.normalize('NFC'));
  return 'saved';
}

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const safeFilename = filename.normalize('NFC');
  const file = new File([blob], safeFilename, {
    type: blob.type || 'application/octet-stream',
  });
  const url = window.URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFilename;
  link.setAttribute('download', safeFilename);
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}
