import 'package:flutter/material.dart';
import '../../data/app_data_store.dart';
import '../../models/app_user.dart';
import '../home/home_screen.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nameController = TextEditingController();
  UserRole _role = UserRole.customer;
  bool _loading = false;

  Future<void> _submit() async {
    if (_nameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Введите имя')),
      );
      return;
    }
    setState(() => _loading = true);
    try {
      await AppData.instance.createProfile(name: _nameController.text.trim(), role: _role);
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const HomeScreen()),
        (route) => false,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Не удалось сохранить профиль: $e')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Создание профиля')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Ваше имя', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(hintText: 'Иван Иванов'),
            ),
            const SizedBox(height: 24),
            const Text('Вы хотите...', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            _RoleCard(
              title: 'Заказывать технику',
              subtitle: 'Создавать заказы и находить исполнителей',
              selected: _role == UserRole.customer,
              onTap: () => setState(() => _role = UserRole.customer),
            ),
            const SizedBox(height: 12),
            _RoleCard(
              title: 'Предоставлять технику',
              subtitle: 'Откликаться на заказы как исполнитель',
              selected: _role == UserRole.contractor,
              onTap: () => setState(() => _role = UserRole.contractor),
            ),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Продолжить'),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  const _RoleCard({
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? const Color(0xFF111827) : const Color(0xFFE5E7EB),
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              selected ? Icons.check_circle : Icons.circle_outlined,
              color: selected ? const Color(0xFF111827) : Colors.black38,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(subtitle, style: const TextStyle(color: Colors.black54, fontSize: 13)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
