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

// Expo Go asks EAS Update for the runtime «exposdk:<SDK>», not the app
// version an APK uses (runtimeVersion policy appVersion). EXPO_GO_UPDATE=1 at
// publish time stamps the update for Expo Go, so the same channel serves both:
//   EXPO_GO_UPDATE=1 npx eas update --branch preview --platform all ...
const EXPO_GO_RUNTIME = `exposdk:${require('expo/package.json').version.split('.')[0]}.0.0`;

module.exports = ({ config }) => {
  const expo = { ...base.expo, ...config };
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return {
    ...expo,
    ...(process.env.EXPO_GO_UPDATE === '1' ? { runtimeVersion: EXPO_GO_RUNTIME } : {}),
    android: {
      ...expo.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
