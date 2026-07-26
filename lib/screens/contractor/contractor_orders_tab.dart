import 'package:flutter/material.dart';
import '../../data/app_data_store.dart';
import '../../models/contractor.dart';
import '../../models/order.dart';

/// Contractor-side feed of open orders in their own category, with a
/// "Откликнуться" action that submits a real bid (price + arrival time).
class ContractorOrdersTab extends StatefulWidget {
  const ContractorOrdersTab({super.key});

  @override
  State<ContractorOrdersTab> createState() => _ContractorOrdersTabState();
}

class _ContractorOrdersTabState extends State<ContractorOrdersTab> {
  @override
  void initState() {
    super.initState();
    final mine = AppData.instance.myContractorProfile();
    if (mine != null) {
      AppData.instance.loadContractorFeed(mine);
    }
  }

  Future<void> _respond(Order order, Contractor contractor) async {
    final priceController = TextEditingController(text: contractor.price.toString());
    final etaController = TextEditingController(text: contractor.etaMinutes.toString());
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Откликнуться на заказ'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
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
          ElevatedButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Отправить')),
        ],
      ),
    );
    final price = int.tryParse(priceController.text.trim()) ?? contractor.price;
    final eta = int.tryParse(etaController.text.trim()) ?? contractor.etaMinutes;
    priceController.dispose();
    etaController.dispose();
    if (result != true || !mounted) return;
    await AppData.instance.respondToOrder(order, contractor, price: price, eta: '$eta мин');
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Отклик отправлен заказчику')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: AppData.instance,
      builder: (context, _) => _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    final contractor = AppData.instance.myContractorProfile();
    if (contractor == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('Профиль исполнителя не найден.\nЗаполните тариф на вкладке «Профиль».', style: TextStyle(color: Colors.black54)),
        ),
      );
    }

    final orders = AppData.instance.openOrdersForContractor(contractor);

    if (orders.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Пока нет новых заказов в вашей категории.\nМы покажем их здесь, как только заказчики создадут заявку.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.black54),
          ),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: orders.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final order = orders[index];
        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE5E7EB)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(order.categoryTitle, style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(order.address, style: const TextStyle(color: Colors.black54, fontSize: 13)),
              if (order.comment.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(order.comment, style: const TextStyle(color: Colors.black54, fontSize: 13)),
              ],
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerRight,
                child: ElevatedButton(
                  onPressed: () => _respond(order, contractor),
                  child: const Text('Откликнуться'),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
