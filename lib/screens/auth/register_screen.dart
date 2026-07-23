import 'package:flutter/material.dart';
import '../../data/app_data_store.dart';
import '../../models/app_user.dart';
import '../../models/equipment_category.dart';
import '../home/home_screen.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nameController = TextEditingController();
  final _priceController = TextEditingController(text: '3000');
  final _etaController = TextEditingController(text: '20');
  UserRole _role = UserRole.customer;
  String _categoryId = equipmentCategories.first.id;
  bool _loading = false;

  @override
  void dispose() {
    _nameController.dispose();
    _priceController.dispose();
    _etaController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_nameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Введите имя')),
      );
      return;
    }
    final price = int.tryParse(_priceController.text.trim());
    final eta = int.tryParse(_etaController.text.trim());
    if (_role == UserRole.contractor && (price == null || price <= 0 || eta == null || eta <= 0)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Укажите корректные цену и время подачи')),
      );
      return;
    }
    setState(() => _loading = true);
    try {
      await AppData.instance.createProfile(name: _nameController.text.trim(), role: _role);
      if (_role == UserRole.contractor) {
        await AppData.instance.registerAsContractor(
          categoryId: _categoryId,
          price: price!,
          etaMinutes: eta!,
        );
      }
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
        child: ListView(
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
            if (_role == UserRole.contractor) ...[
              const SizedBox(height: 24),
              const Text('Какую технику предоставляете', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: _categoryId,
                items: equipmentCategories
                    .map((c) => DropdownMenuItem(value: c.id, child: Text(c.title)))
                    .toList(),
                onChanged: (v) => setState(() => _categoryId = v!),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Цена, ₽', style: TextStyle(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _priceController,
                          keyboardType: TextInputType.number,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Подача, мин', style: TextStyle(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _etaController,
                          keyboardType: TextInputType.number,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              const Text(
                'Категорию и цену можно будет изменить позже в профиле.',
                style: TextStyle(color: Colors.black54, fontSize: 12),
              ),
            ],
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
