import 'package:flutter/material.dart';
import '../../data/app_data_store.dart';
import '../../models/equipment_category.dart';
import 'order_detail_screen.dart';

class CreateOrderScreen extends StatefulWidget {
  final EquipmentCategory initialCategory;
  const CreateOrderScreen({super.key, required this.initialCategory});

  @override
  State<CreateOrderScreen> createState() => _CreateOrderScreenState();
}

class _CreateOrderScreenState extends State<CreateOrderScreen> {
  late EquipmentCategory _category;
  final _addressController = TextEditingController();
  final _commentController = TextEditingController();
  DateTime _date = DateTime.now().add(const Duration(days: 1));

  @override
  void initState() {
    super.initState();
    _category = widget.initialCategory;
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 90)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _submit() async {
    if (_addressController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Укажите адрес объекта')),
      );
      return;
    }
    final order = await AppData.instance.createOrder(
      categoryId: _category.id,
      categoryTitle: _category.title,
      address: _addressController.text.trim(),
      date: _date,
      comment: _commentController.text.trim(),
    );
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: order.id)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Новый заказ')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('Техника', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: equipmentCategories.map((c) {
              final selected = c.id == _category.id;
              return ChoiceChip(
                label: Text(c.title),
                selected: selected,
                onSelected: (_) => setState(() => _category = c),
              );
            }).toList(),
          ),
          const SizedBox(height: 20),
          const Text('Адрес объекта', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          TextField(
            controller: _addressController,
            decoration: const InputDecoration(hintText: 'г. Набережные Челны, ...'),
          ),
          const SizedBox(height: 20),
          const Text('Дата', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _pickDate,
            icon: const Icon(Icons.calendar_today, size: 18),
            label: Text('${_date.day}.${_date.month}.${_date.year}'),
          ),
          const SizedBox(height: 20),
          const Text('Комментарий', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          TextField(
            controller: _commentController,
            maxLines: 3,
            decoration: const InputDecoration(hintText: 'Детали задачи (необязательно)'),
          ),
          const SizedBox(height: 28),
          ElevatedButton(onPressed: _submit, child: const Text('Создать заказ')),
        ],
      ),
    );
  }
}
