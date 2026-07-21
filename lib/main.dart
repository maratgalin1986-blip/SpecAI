import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'data/app_data_store.dart';
import 'data/demo_data_store.dart';
import 'data/firebase_data_store.dart';
import 'firebase_options.dart';
import 'screens/auth/login_screen.dart';
import 'screens/home/home_screen.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)
        .timeout(const Duration(seconds: 8));
    AppData.instance = FirebaseDataStore.instance;
  } catch (e) {
    // Firebase not configured for this platform/build (e.g. placeholder
    // options) — fall back to the in-memory demo backend so the app still
    // runs end-to-end without any external services.
    debugPrint('Firebase unavailable, falling back to demo mode: $e');
    AppData.instance = DemoDataStore.instance;
  }
  runApp(const SpecAiApp());
}

class SpecAiApp extends StatelessWidget {
  const SpecAiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SpecAI',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: AppData.instance.hasProfile ? const HomeScreen() : const LoginScreen(),
    );
  }
}
