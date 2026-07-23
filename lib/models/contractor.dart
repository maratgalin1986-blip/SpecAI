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

  /// Id of the AppUser who owns this listing, for real contractor accounts
  /// registered through the app. Null for the seeded demo fixtures.
  final String? ownerId;

  Contractor({
    required this.id,
    required this.name,
    required this.categoryId,
    required this.price,
    required this.etaMinutes,
    required this.rating,
    required this.position,
    this.status = ContractorStatus.available,
    this.ownerId,
  });
}
