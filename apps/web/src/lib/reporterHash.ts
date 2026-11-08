// Who stands behind a price in the index (lib/priceIndex.ts), as keyed
// hashes: the IP, the Telegram user, the account or the company are never
// stored as such, and without the server's secret a key cannot be turned back.
// Server only (node:crypto).
import { createHmac } from 'node:crypto';
import { ipSubnet } from './priceReports';

function keyed(kind: string, raw: string): string {
  const secret = process.env.NEXTAUTH_SECRET || 'price-survey';
  return createHmac('sha256', secret)
    .update(`price-report:${kind}:${raw}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * A provider company in the index: its machines and its own survey answers
 * share this key («c:<hash>»), so a company never counts twice.
 */
export function companyReporter(companyId: string): string {
  return `c:${keyed('company', companyId)}`;
}

/**
 * PriceReport.reporterHash: «ip» (a guest's address), «tg» (a Telegram user —
 * his private chat has the same id), «user» (an account) or «company» (a
 * signed-in provider, as companyReporter). The same person gives the same
 * key: one vote in the index, one counter in the limits.
 */
export function reporterHash(kind: 'ip' | 'tg' | 'user' | 'company', raw: string): string {
  return kind === 'company' ? companyReporter(raw) : keyed(kind, raw);
}

/**
 * PriceReport.networkHash of a guest: his network (IPv4 /24, IPv6 /48). In
 * the index guests of one network count as one participant, so a few
 * addresses cannot make up the three reporters of a number alone.
 */
export function networkKey(ip: string): string {
  return `n:${keyed('net', ipSubnet(ip))}`;
}
