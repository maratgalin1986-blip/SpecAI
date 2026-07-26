import 'package:flutter/material.dart';
import '../../data/app_data_store.dart';
import '../../models/order.dart';
import '../chat/chat_screen.dart';

/// Contractor-side view of orders they're working or have finished, plus
/// the commission summary. The commission actually owed is always shown
/// as 0 ₽ -- no payment gateway is wired up yet, so nothing is ever
/// charged -- alongside a preview of what the kCommissionRatePercent cut
/// would have been once billing goes live.
class ContractorJobsTab extends StatefulWidget {
  const ContractorJobsTab({super.key});

  @override
  State<ContractorJobsTab> createState() => _ContractorJobsTabState();
}

class _ContractorJobsTabState extends State<ContractorJobsTab> {
  @override
  void initState() {
    super.initState();
    final mine = AppData.instance.myContractorProfile();
    if (mine != null) {
      AppData.instance.loadContractorFeed(mine);
    }
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

    final active = AppData.instance.activeOrdersForContractor(contractor);
    final completed = AppData.instance.completedOrdersForContractor(contractor);
    final potentialCommission = completed.fold<int>(
      0,
      (sum, o) => sum + (o.acceptedPrice * kCommissionRatePercent / 100).round(),
    );
    final ratings = completed.map((o) => o.customerRating).whereType<int>().toList();
    final averageRating = ratings.isEmpty ? null : ratings.reduce((a, b) => a + b) / ratings.length;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (averageRating != null) ...[
          _RatingSummaryCard(average: averageRating, count: ratings.length),
          const SizedBox(height: 16),
        ],
        _CommissionCard(completedCount: completed.length, potentialCommission: potentialCommission),
        const SizedBox(height: 20),
        const Text('В работе', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
        const SizedBox(height: 10),
        if (active.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('Нет заказов в работе.', style: TextStyle(color: Colors.black54)),
          )
        else
          ...active.map((order) => _JobCard(order: order, active: true)),
        const SizedBox(height: 20),
        const Text('Завершённые', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
        const SizedBox(height: 10),
        if (completed.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('Пока нет завершённых заказов.', style: TextStyle(color: Colors.black54)),
          )
        else
          ...completed.map((order) => _JobCard(order: order, active: false)),
      ],
    );
  }
}

extension on Order {
  /// Price the contractor was accepted at for this order.
  int get acceptedPrice {
    final match = responses.where((r) => r.contractorId == acceptedContractorId);
    return match.isEmpty ? 0 : match.first.price;
  }
}

class _RatingSummaryCard extends StatelessWidget {
  final double average;
  final int count;
  const _RatingSummaryCard({required this.average, required this.count});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        children: [
          const Icon(Icons.star, color: Colors.amber, size: 28),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(average.toStringAsFixed(1), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              Text('по оценкам заказчиков: $count', style: const TextStyle(color: Colors.black54, fontSize: 12)),
            ],
          ),
        ],
      ),
    );
  }
}

class _CommissionCard extends StatelessWidget {
  final int completedCount;
  final int potentialCommission;
  const _CommissionCard({required this.completedCount, required this.potentialCommission});

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
              Icon(Icons.receipt_long_outlined, color: Color(0xFF111827)),
              SizedBox(width: 8),
              Text('Комиссия платформы', style: TextStyle(fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 12),
          const Text('К оплате сейчас', style: TextStyle(color: Colors.black54, fontSize: 12)),
          const Text('0 ₽', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text(
            completedCount == 0
                ? 'Оплата пока не подключена — комиссия не списывается.'
                : 'Оплата пока не подключена — комиссия не списывается. При ставке ${kCommissionRatePercent.toStringAsFixed(0)}% с $completedCount завершённых заказов это было бы примерно $potentialCommission ₽.',
            style: const TextStyle(color: Colors.black54, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class _JobCard extends StatelessWidget {
  final Order order;
  final bool active;
  const _JobCard({required this.order, required this.active});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(order.categoryTitle, style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(order.address, style: const TextStyle(color: Colors.black54, fontSize: 13)),
                if (active) ...[
                  const SizedBox(height: 4),
                  Text(
                    order.trackingStatus.isEmpty ? 'В пути' : order.trackingStatus,
                    style: const TextStyle(color: Colors.blue, fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                ],
              ],
            ),
          ),
          if (active)
            IconButton(
              icon: const Icon(Icons.chat_bubble_outline),
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => ChatScreen(orderId: order.id)),
                );
              },
            )
          else
            const Icon(Icons.check_circle, color: Colors.green),
        ],
      ),
    );
  }
}
