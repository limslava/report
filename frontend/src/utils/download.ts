type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
};

type FileSystemWritableFileStream = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};

type FileSystemFileHandle = {
  createWritable: () => Promise<FileSystemWritableFileStream>;
};

type WindowWithSavePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
};

/**
 * Сохранение файла, который ещё нужно получить с сервера: окно «Сохранить как» открывается
 * сразу по клику, а не после загрузки — иначе браузер его больше не показывает (разрешение
 * действует несколько секунд после нажатия) и файл молча падает в «Загрузки».
 */
export async function saveFileWithPicker(suggestedName: string, load: () => Promise<Blob>): Promise<'saved' | 'cancelled'> {
  const safeName = suggestedName.normalize('NFC');
  const savePicker = (window as WindowWithSavePicker).showSaveFilePicker;
  if (savePicker) {
    let handle: FileSystemFileHandle | null = null;
    try {
      handle = await savePicker.call(window, {
        suggestedName: safeName,
        types: [
          {
            description: 'Excel workbook',
            accept: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            },
          },
        ],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      handle = null;
    }
    if (handle) {
      const blob = await load();
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'saved';
    }
  }
  await downloadBlob(await load(), safeName);
  return 'saved';
}

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const safeFilename = filename.normalize('NFC');
  const savePicker = (window as WindowWithSavePicker).showSaveFilePicker;

  if (savePicker) {
    try {
      const handle = await savePicker.call(window, {
        suggestedName: safeFilename,
        types: [
          {
            description: 'Excel workbook',
            accept: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Fall back to browser download if direct file saving is unavailable.
    }
  }

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
