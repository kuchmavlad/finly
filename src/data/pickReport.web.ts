import * as DocumentPicker from 'expo-document-picker';
import { MAX_REPORT_BYTES, ReportError } from '../domain/ibkr/preview';

export async function pickReport(): Promise<{ name: string; xml: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, base64: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  try {
    if (!asset.file || !/\.xml$/i.test(asset.name)) throw new ReportError('Choose an XML file.');
    if (asset.file.size > MAX_REPORT_BYTES) throw new ReportError('Report exceeds 10 MiB. Export a shorter period.');
    return { name: asset.name, xml: await asset.file.text() };
  } finally { if (asset.uri.startsWith('blob:')) URL.revokeObjectURL(asset.uri); }
}
