import 'package:flutter/material.dart';
import '../../data/demo_data_store.dart';
import 'register_screen.dart';
import '../home/home_screen.dart';

class OtpScreen extends StatefulWidget {
  final String demoCode;
  final String phone;
  const OtpScreen({super.key, required this.demoCode, required this.phone});

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _codeController = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _verify() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final ok = await DemoDataStore.instance.verifyOtp(_codeController.text.trim());
    setState(() => _loading = false);
    if (!ok) {
      setState(() => _error = 'Неверный код. Попробуйте ещё раз.');
      return;
    }
    if (!mounted) return;
    final hasProfile = DemoDataStore.instance.hasProfile;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => hasProfile ? const HomeScreen() : const RegisterScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Подтверждение номера')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Код отправлен на ${widget.phone}'),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF7DA),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                'Демо-режим: код подтверждения — ${widget.demoCode}',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _codeController,
              keyboardType: TextInputType.number,
              maxLength: 4,
              decoration: const InputDecoration(hintText: '0000'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loading ? null : _verify,
              child: _loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Подтвердить'),
            ),
          ],
        ),
      ),
    );
  }
}
