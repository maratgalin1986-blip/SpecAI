import 'package:flutter/material.dart';
import '../../data/app_data_store.dart';
import '../../models/app_user.dart';
import '../../models/equipment_category.dart';
import '../auth/login_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: AppData.instance,
      builder: (context, _) => _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    final user = AppData.instance.currentUser!;
    final isContractor = user.role == UserRole.contractor;

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        CircleAvatar(
          radius: 32,
          backgroundColor: const Color(0xFF111827),
          child: Text(
            user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
            style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(height: 12),
        Text(user.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        Text(user.phone, style: const TextStyle(color: Colors.black54)),
        const SizedBox(height: 4),
        Text(
          isContractor ? 'Исполнитель' : 'Заказчик',
          style: const TextStyle(color: Colors.black54),
        ),
        const SizedBox(height: 28),
        if (isContractor) ...[
          const _ContractorListingCard(),
          const SizedBox(height: 16),
        ],
        if (isContractor) _ContractorMonetizationCard() else _CustomerSupportCard(),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: () {
            AppData.instance.signOut();
            Navigator.of(context).pushAndRemoveUntil(
              MaterialPageRoute(builder: (_) => const LoginScreen()),
              (route) => false,
            );
          },
          icon: const Icon(Icons.logout),
          label: const Text('Выйти'),
        ),
      ],
    );
  }
}

class _ContractorListingCard extends StatelessWidget {
  const _ContractorListingCard();

  Future<void> _edit(BuildContext context) async {
    final mine = AppData.instance.myContractorProfile();
    var categoryId = mine?.categoryId ?? equipmentCategories.first.id;
    final priceController = TextEditingController(text: (mine?.price ?? 3000).toString());
    final etaController = TextEditingController(text: (mine?.etaMinutes ?? 20).toString());

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Мой тариф'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DropdownButtonFormField<String>(
                value: categoryId,
                items: equipmentCategories
                    .map((c) => DropdownMenuItem(value: c.id, child: Text(c.title)))
                    .toList(),
                onChanged: (v) => setState(() => categoryId = v!),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: priceController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Цена, ₽'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: etaController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Время подачи, мин'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Отмена')),
            ElevatedButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Сохранить')),
          ],
        ),
      ),
    );

    if (saved != true) return;
    final price = int.tryParse(priceController.text.trim()) ?? mine?.price ?? 3000;
    final eta = int.tryParse(etaController.text.trim()) ?? mine?.etaMinutes ?? 20;
    await AppData.instance.registerAsContractor(categoryId: categoryId, price: price, etaMinutes: eta);
  }

  @override
  Widget build(BuildContext context) {
    final mine = AppData.instance.myContractorProfile();
    final categoryTitle = mine == null
        ? '—'
        : equipmentCategories.firstWhere((c) => c.id == mine.categoryId, orElse: () => equipmentCategories.first).title;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Мой тариф', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                Text(
                  mine == null ? 'Не заполнено' : '$categoryTitle · ${mine.price} ₽ · подача ${mine.etaMinutes} мин',
                  style: const TextStyle(color: Colors.black54, fontSize: 13),
                ),
              ],
            ),
          ),
          TextButton(onPressed: () => _edit(context), child: const Text('Изменить')),
        ],
      ),
    );
  }
}

class _ContractorMonetizationCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.workspace_premium_outlined, color: Color(0xFF111827)),
              SizedBox(width: 8),
              Text('Тариф исполнителя', style: TextStyle(fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Сейчас площадка бесплатна для исполнителей на этапе запуска.',
            style: TextStyle(color: Colors.black87),
          ),
          const SizedBox(height: 8),
          Text(
            'После запуска платных тарифов комиссия SpecAI составит ${kCommissionRatePercent.toStringAsFixed(0)}% с завершённого заказа '
            '(или фиксированная подписка — выберем позже). Приём платежей ещё не подключён — '
            'фактическая сумма к оплате всегда 0 ₽, актуальный расчёт смотрите на вкладке «В работе».',
            style: const TextStyle(color: Colors.black54, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class _CustomerSupportCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.favorite_border, color: Color(0xFF111827)),
              SizedBox(width: 8),
              Text('Поддержать проект', style: TextStyle(fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'SpecAI развивается независимо. Приём донатов появится, как только подключим платёжный шлюз.',
            style: TextStyle(color: Colors.black54, fontSize: 13),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: () {
              showDialog(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('Скоро'),
                  content: const Text('Приём донатов ещё не подключён — здесь появится оплата картой/СБП после интеграции платёжного шлюза.'),
                  actions: [
                    TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Понятно')),
                  ],
                ),
              );
            },
            child: const Text('Задонатить'),
          ),
        ],
      ),
    );
  }
}
