import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import '../../data/app_data_store.dart';
import '../../models/contractor.dart';
import '../../models/equipment_category.dart';
import '../orders/create_order_screen.dart';

class ContractorsMapScreen extends StatefulWidget {
  final String? initialCategoryId;
  const ContractorsMapScreen({super.key, this.initialCategoryId});

  @override
  State<ContractorsMapScreen> createState() => _ContractorsMapScreenState();
}

class _ContractorsMapScreenState extends State<ContractorsMapScreen> {
  String? _categoryFilter;

  @override
  void initState() {
    super.initState();
    _categoryFilter = widget.initialCategoryId;
  }

  @override
  Widget build(BuildContext context) {
    final store = AppData.instance;
    final contractors = _categoryFilter == null
        ? store.contractors
        : store.contractorsForCategory(_categoryFilter!);

    return Scaffold(
      appBar: AppBar(title: const Text('Исполнители рядом')),
      body: Column(
        children: [
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: const Text('Все'),
                    selected: _categoryFilter == null,
                    onSelected: (_) => setState(() => _categoryFilter = null),
                  ),
                ),
                ...equipmentCategories.map(
                  (c) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(c.title),
                      selected: _categoryFilter == c.id,
                      onSelected: (_) => setState(() => _categoryFilter = c.id),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: FlutterMap(
              options: MapOptions(
                initialCenter: kCityCenter,
                initialZoom: 12,
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.specai.app',
                ),
                MarkerLayer(
                  markers: contractors.map((c) {
                    final available = c.status == ContractorStatus.available;
                    return Marker(
                      point: c.position,
                      width: 120,
                      height: 56,
                      child: GestureDetector(
                        onTap: () => _showContractorSheet(context, c),
                        child: Column(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: available ? const Color(0xFF111827) : Colors.grey,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                '${c.price} ₽',
                                style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                              ),
                            ),
                            Icon(
                              Icons.local_shipping,
                              color: available ? const Color(0xFF111827) : Colors.grey,
                              size: 26,
                            ),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showContractorSheet(BuildContext context, Contractor c) {
    final category = equipmentCategories.firstWhere((e) => e.id == c.categoryId);
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (context) {
        final available = c.status == ContractorStatus.available;
        return Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(category.icon, size: 30),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(c.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                        Text(category.title, style: const TextStyle(color: Colors.black54)),
                      ],
                    ),
                  ),
                  Row(
                    children: [
                      const Icon(Icons.star, color: Colors.amber, size: 18),
                      Text(c.rating.toStringAsFixed(1)),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('${c.price} ₽', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                  Text(
                    available ? 'Свободен · ~${c.etaMinutes} мин' : 'Занят',
                    style: TextStyle(color: available ? Colors.green : Colors.grey, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: available
                    ? () {
                        Navigator.of(context).pop();
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => CreateOrderScreen(initialCategory: category)),
                        );
                      }
                    : null,
                child: Text(available ? 'Заказать за ${c.price} ₽' : 'Сейчас недоступен'),
              ),
            ],
          ),
        );
      },
    );
  }
}
