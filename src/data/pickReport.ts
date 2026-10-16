import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { MAX_REPORT_BYTES, ReportError } from '../domain/ibkr/preview';

export async function pickReport(): Promise<{ name: string; xml: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const file = new File(asset.uri);
  // Only remove the picker-created cache copy, never the user's source document.
  if (!file.uri.startsWith(Paths.cache.uri.replace(/\/$/, '') + '/')) throw new ReportError('Could not read a temporary copy of this report.');
  try {
    if (!/\.xml$/i.test(asset.name)) throw new ReportError('Choose an XML file.');
    if (file.size > MAX_REPORT_BYTES) throw new ReportError('Report exceeds 10 MiB. Export a shorter period.');
    return { name: asset.name, xml: await file.text() };
  } finally {
    try { if (file.exists) file.delete(); }
    catch { throw new ReportError('Could not remove the temporary report copy. Clear the app cache before continuing.'); }
  }
}
