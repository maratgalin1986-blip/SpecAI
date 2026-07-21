import 'package:flutter/material.dart';
import 'data/demo_data_store.dart';
import 'screens/auth/login_screen.dart';
import 'screens/home/home_screen.dart';
import 'theme/app_theme.dart';

void main() {
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
      home: DemoDataStore.instance.hasProfile ? const HomeScreen() : const LoginScreen(),
    );
  }
}
