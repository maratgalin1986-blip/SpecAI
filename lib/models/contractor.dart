import 'package:latlong2/latlong.dart';

enum ContractorStatus { available, busy }

class Contractor {
  final String id;
  final String name;
  final String categoryId;
  final int price;
  final int etaMinutes;
  final double rating;
  LatLng position;
  ContractorStatus status;

  Contractor({
    required this.id,
    required this.name,
    required this.categoryId,
    required this.price,
    required this.etaMinutes,
    required this.rating,
    required this.position,
    this.status = ContractorStatus.available,
  });
}
