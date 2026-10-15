// Dynamic app config: app.json plus what only the build server knows.
//
// Push on Android in an APK/store build needs Firebase. The project is
// specai-dev (made in July 2026 from the owner's account); its
// google-services.json for the package com.specai.specai is checked in next
// to app.json (Google treats the file as public: it ships inside every app).
// An EAS environment variable of type «file» named GOOGLE_SERVICES_JSON
// overrides it. Sending push also needs the FCM V1 service account key
// uploaded on expo.dev under Credentials → Android → Push Notifications
// (apps/mobile/README.md).
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
