import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { MAX_REPORT_BYTES, ReportError } from '../domain/ibkr/preview';

export async function pickReport(): Promise<{ name: string; xml: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const file = new File(asset.uri);
  // copyToCacheDirectory gives us a picker-owned copy to read and remove.
  // Its URI need not share the textual prefix of FileSystem's cache URI (Expo Go).
  try {
    if (!/\.xml$/i.test(asset.name)) throw new ReportError('Choose an XML file.');
    if (file.size > MAX_REPORT_BYTES) throw new ReportError('Report exceeds 10 MiB. Export a shorter period.');
    return { name: asset.name, xml: await file.text() };
  } finally {
    try { if (file.exists) file.delete(); }
    catch { throw new ReportError('Could not remove the temporary report copy. Clear the app cache before continuing.'); }
  }
}
