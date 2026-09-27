// Build step: when the database is in Yandex Cloud, download Yandex's root CA
// and bundle it (src/certs/yandexCa.ts) so connections verify the server
// certificate. Does nothing for other databases and never fails the build.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isYandexDatabaseUrl } from '../src/connection';

const CA_URL = 'https://storage.yandexcloud.net/cloud-certs/CA.pem';
const TARGET = join(__dirname, '..', 'src', 'certs', 'yandexCa.ts');

async function main() {
  if (![process.env.DATABASE_URL, process.env.DIRECT_URL].some(isYandexDatabaseUrl)) {
    console.info('[yandex-ca] database is not in Yandex Cloud — skipping');
    return;
  }
  try {
    const response = await fetch(CA_URL, { signal: AbortSignal.timeout(15_000) });
    const pem = await response.text();
    if (!response.ok || !pem.includes('-----BEGIN CERTIFICATE-----')) {
      throw new Error(`unexpected response ${response.status}`);
    }
    writeFileSync(
      TARGET,
      `// Downloaded from ${CA_URL} during the build.\nexport const YANDEX_CA: string = ${JSON.stringify(pem)};\n`,
    );
    console.info('[yandex-ca] Yandex Cloud root CA bundled');
  } catch (error) {
    console.warn('[yandex-ca] could not download the CA, TLS will not be verified:', error);
  }
}

void main();
