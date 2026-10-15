// Dynamic app config: app.json plus what only the build server knows.
//
// Push on Android in an APK/store build needs Firebase: a project-level EAS
// environment variable of type «file» named GOOGLE_SERVICES_JSON (expo.dev →
// project → Environment variables; the file from the Firebase console for the
// package com.specai.app) and the FCM V1 service account key uploaded under
// Credentials → Android → Push Notifications. Without the variable the app
// builds and works, only push stays silent (apps/mobile/README.md).
const base = require('./app.json');

module.exports = ({ config }) => {
  const expo = { ...base.expo, ...config };
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return {
    ...expo,
    android: {
      ...expo.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
