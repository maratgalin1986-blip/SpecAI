import 'package:flutter/material.dart';
import '../../data/demo_data_store.dart';
import '../../models/order.dart';
import '../../widgets/order_tracking_map.dart';
import '../chat/chat_screen.dart';

class OrderDetailScreen extends StatelessWidget {
  final String orderId;
  const OrderDetailScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: DemoDataStore.instance,
      builder: (context, _) {
        final order = DemoDataStore.instance.orders.firstWhere((o) => o.id == orderId);
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
                ...order.responses.map((r) => Container(
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
                                Text(r.contractorName, style: const TextStyle(fontWeight: FontWeight.w600)),
                                Text('${r.price} ₽ · прибытие через ${r.eta}', style: const TextStyle(color: Colors.black54, fontSize: 13)),
                              ],
                            ),
                          ),
                          ElevatedButton(
                            onPressed: () => DemoDataStore.instance.acceptResponse(order, r),
                            child: const Text('Принять'),
                          ),
                        ],
                      ),
                    )),
              ],
              if (order.status == OrderStatus.inProgress) ...[
                OrderTrackingMap(order: order),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: (order.contractorArrived ? Colors.green : Colors.blue).withOpacity(0.08),
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
                  onPressed: () => DemoDataStore.instance.completeOrder(order),
                  child: const Text('Завершить заказ'),
                ),
              ],
              if (order.status == OrderStatus.completed)
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.green.withOpacity(0.1),
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
            ],
          ),
        );
      },
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
