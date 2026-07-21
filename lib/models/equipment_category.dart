import 'package:flutter/material.dart';

class EquipmentCategory {
  final String id;
  final String title;
  final IconData icon;

  const EquipmentCategory({required this.id, required this.title, required this.icon});
}

const List<EquipmentCategory> equipmentCategories = [
  EquipmentCategory(id: 'crane', title: 'Автокран', icon: Icons.construction),
  EquipmentCategory(id: 'excavator', title: 'Экскаватор', icon: Icons.agriculture),
  EquipmentCategory(id: 'bulldozer', title: 'Бульдозер', icon: Icons.terrain),
  EquipmentCategory(id: 'dump_truck', title: 'Самосвал', icon: Icons.local_shipping),
  EquipmentCategory(id: 'loader', title: 'Погрузчик', icon: Icons.engineering),
  EquipmentCategory(id: 'mixer', title: 'Бетономешалка', icon: Icons.build_circle),
];
