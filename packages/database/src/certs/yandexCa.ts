// Yandex Cloud root CA for Managed PostgreSQL (https://storage.yandexcloud.net/cloud-certs/CA.pem).
// Left empty in git; prisma/fetch-yandex-ca.ts fills it in during the build when
// the database is hosted in Yandex Cloud. Without it the connection is still
// encrypted, but the server certificate is not verified.
export const YANDEX_CA: string = '';
