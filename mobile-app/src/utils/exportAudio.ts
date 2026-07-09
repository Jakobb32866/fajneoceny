import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { api } from '../api/client';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Fetches the combined question→pause→answer WAV for up to 100 flashcards
 * and hands it to the OS share sheet so the student can save it wherever
 * they like (Files, a podcast/audio app, etc.) as a single file.
 */
export async function exportFlashcardsAudio(flashcardIds: string[]): Promise<void> {
  const response = await fetch(api.exportAudioUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flashcardIds }),
  });

  if (!response.ok) {
    throw new Error(`Audio export failed: ${response.status}`);
  }

  const blob = await response.blob();
  const base64 = await blobToBase64(blob);
  const fileUri = `${FileSystem.cacheDirectory}fiszki-${Date.now()}.wav`;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: 'audio/wav' });
  }
}
