import 'package:flutter/material.dart';
import '../../data/app_data_store.dart';
import '../../models/order.dart';
import '../../widgets/order_tracking_map.dart';
import '../chat/chat_screen.dart';

class OrderDetailScreen extends StatelessWidget {
  final String orderId;
  const OrderDetailScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: AppData.instance,
      builder: (context, _) {
        final order = AppData.instance.orders.firstWhere((o) => o.id == orderId);
        return Scaffold(
          appBar: AppBar(title: Text(order.categoryTitle)),
          body: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              _InfoRow(label: 'Адрес', value: order.address),
              _InfoRow(label: 'Дата', value: '${order.date.day}.${order.date.month}.${order.date.year}'),
              if (order.comment.isNotEmpty) _InfoRow(label: 'Комментарий', value: order.comment),
              const SizedBox(height: 24),
              if (order.status == OrderStatus.newOrder) ...[
                const Text('Отклики исполнителей', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                const SizedBox(height: 10),
                if (order.responses.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text('Ждём отклики от исполнителей...', style: TextStyle(color: Colors.black54)),
                  ),
                ...order.responses.map((r) {
                  final matches = AppData.instance.contractors.where((c) => c.id == r.contractorId);
                  final contractor = matches.isEmpty ? null : matches.first;
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
                              Row(
                                children: [
                                  Text(r.contractorName, style: const TextStyle(fontWeight: FontWeight.w600)),
                                  if (contractor != null) ...[
                                    const SizedBox(width: 6),
                                    const Icon(Icons.star, color: Colors.amber, size: 14),
                                    Text(
                                      contractor.rating.toStringAsFixed(1),
                                      style: const TextStyle(fontSize: 12, color: Colors.black54),
                                    ),
                                  ],
                                ],
                              ),
                              Text('${r.price} ₽ · прибытие через ${r.eta}', style: const TextStyle(color: Colors.black54, fontSize: 13)),
                            ],
                          ),
                        ),
                        ElevatedButton(
                          onPressed: () => AppData.instance.acceptResponse(order, r),
                          child: const Text('Принять'),
                        ),
                      ],
                    ),
                  );
                }),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () async {
                    final confirmed = await showDialog<bool>(
                      context: context,
                      builder: (context) => AlertDialog(
                        title: const Text('Отменить заказ?'),
                        content: const Text('Заказ будет отменён, отклики исполнителей больше нельзя будет принять.'),
                        actions: [
                          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Назад')),
                          TextButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Отменить заказ')),
                        ],
                      ),
                    );
                    if (confirmed == true) {
                      AppData.instance.cancelOrder(order);
                    }
                  },
                  icon: const Icon(Icons.close),
                  label: const Text('Отменить заказ'),
                ),
              ],
              if (order.status == OrderStatus.inProgress) ...[
                OrderTrackingMap(order: order),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: (order.contractorArrived ? Colors.green : Colors.blue).withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        order.contractorArrived ? Icons.check_circle : Icons.local_shipping,
                        color: order.contractorArrived ? Colors.green : Colors.blue,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(order.trackingStatus.isEmpty ? 'Исполнитель принят. Заказ в работе.' : order.trackingStatus),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => ChatScreen(orderId: order.id)),
                    );
                  },
                  icon: const Icon(Icons.chat_bubble_outline),
                  label: const Text('Открыть чат с исполнителем'),
                ),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: () => AppData.instance.completeOrder(order),
                  child: const Text('Завершить заказ'),
                ),
              ],
              if (order.status == OrderStatus.completed) ...[
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.green.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.check_circle, color: Colors.green),
                      SizedBox(width: 10),
                      Text('Заказ завершён'),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                _RatingSection(order: order),
              ],
              if (order.status == OrderStatus.cancelled)
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.cancel_outlined, color: Colors.black54),
                      SizedBox(width: 10),
                      Text('Заказ отменён'),
                    ],
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _RatingSection extends StatefulWidget {
  final Order order;
  const _RatingSection({required this.order});

  @override
  State<_RatingSection> createState() => _RatingSectionState();
}

class _RatingSectionState extends State<_RatingSection> {
  bool _submitting = false;

  Future<void> _rate(int stars) async {
    setState(() => _submitting = true);
    await AppData.instance.rateOrder(widget.order, stars);
    if (mounted) setState(() => _submitting = false);
  }

  @override
  Widget build(BuildContext context) {
    final rating = widget.order.customerRating;
    if (rating != null) {
      return Row(
        children: [
          const Text('Ваша оценка: ', style: TextStyle(color: Colors.black54)),
          ...List.generate(
            5,
            (i) => Icon(
              i < rating ? Icons.star : Icons.star_border,
              color: Colors.amber,
              size: 20,
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Оцените исполнителя', style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Row(
          children: List.generate(5, (i) {
            final starIndex = i + 1;
            return IconButton(
              onPressed: _submitting ? null : () => _rate(starIndex),
              icon: const Icon(Icons.star_border, color: Colors.amber),
            );
          }),
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Colors.black54, fontSize: 12)),
          Text(value, style: const TextStyle(fontSize: 15)),
        ],
      ),
    );
  }
}
