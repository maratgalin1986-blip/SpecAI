import QRCode from 'qrcode';
import { siteUrl } from '@/lib/siteUrl';

// QR code that opens the site from a phone camera. It always points at the
// production address (previews too) and carries UTM tags, so visits from
// printed codes show up as their own channel in the marketing report.

export function qrTargetUrl() {
  return `${siteUrl()}/?utm_source=qr&utm_medium=offline&utm_campaign=qr`;
}

const OPTIONS = { errorCorrectionLevel: 'M', margin: 2 } as const;

export function qrSvg(dark = '#020617', light = '#ffffff') {
  return QRCode.toString(qrTargetUrl(), { ...OPTIONS, type: 'svg', color: { dark, light } });
}

export function qrPng(width = 1200) {
  return QRCode.toBuffer(qrTargetUrl(), { ...OPTIONS, type: 'png', width });
}
