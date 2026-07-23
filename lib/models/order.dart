import 'package:latlong2/latlong.dart';

enum OrderStatus { newOrder, inProgress, completed, cancelled }

class OrderResponse {
  final String id;
  final String contractorId;
  final String contractorName;
  final int price;
  final String eta;
  bool accepted;

  OrderResponse({
    required this.id,
    required this.contractorId,
    required this.contractorName,
    required this.price,
    required this.eta,
    this.accepted = false,
  });
}

class Order {
  final String id;
  final String customerId;
  final String categoryId;
  final String categoryTitle;
  final String address;
  final DateTime date;
  final String comment;
  OrderStatus status;
  final List<OrderResponse> responses;
  String? acceptedContractorId;

  /// Approximate map point for the order address (demo geocoding).
  final LatLng? destination;

  /// Live position of the accepted contractor, updated while in progress.
  LatLng? contractorPosition;
  bool contractorArrived;
  String trackingStatus;

  /// Customer's 1-5 star rating of the contractor, given once the order is
  /// completed. Null until rated.
  int? customerRating;

  Order({
    required this.id,
    required this.customerId,
    required this.categoryId,
    required this.categoryTitle,
    required this.address,
    required this.date,
    required this.comment,
    this.status = OrderStatus.newOrder,
    List<OrderResponse>? responses,
    this.acceptedContractorId,
    this.destination,
    this.contractorPosition,
    this.contractorArrived = false,
    this.trackingStatus = '',
    this.customerRating,
  }) : responses = responses ?? [];
}
