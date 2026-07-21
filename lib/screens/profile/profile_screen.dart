import 'package:flutter/material.dart';
import '../../data/demo_data_store.dart';
import '../../models/app_user.dart';
import '../auth/login_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = DemoDataStore.instance.currentUser!;
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
        if (isContractor) _ContractorMonetizationCard() else _CustomerSupportCard(),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: () {
            DemoDataStore.instance.signOut();
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
            'После запуска платных тарифов комиссия SpecAI составит ${DemoDataStore.commissionRatePercent.toStringAsFixed(0)}% с завершённого заказа '
            '(или фиксированная подписка — выберем позже). Приём платежей ещё не подключён.',
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
