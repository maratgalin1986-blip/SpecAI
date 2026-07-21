import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';
import '../models/app_user.dart';
import '../models/order.dart';
import '../models/chat_message.dart';
import '../models/contractor.dart';

/// Shared surface both DemoDataStore (in-memory, no backend) and
/// FirebaseDataStore (real auth + Firestore) implement, so screens can
/// depend on `AppData.instance` without caring which one is active.
abstract class AppDataStore extends ChangeNotifier {
  AppUser? get currentUser;
  bool get hasProfile;
  String? get pendingPhone;

  List<Order> get orders;
  List<Contractor> get contractors;

  Future<String?> requestOtp(String phone);
  Future<bool> verifyOtp(String code);
  Future<void> createProfile({required String name, required UserRole role});
  void signOut();

  Future<Order> createOrder({
    required String categoryId,
    required String categoryTitle,
    required String address,
    required DateTime date,
    required String comment,
  });

  List<Order> ordersForCurrentUser();
  List<Contractor> contractorsForCategory(String categoryId);
  void acceptResponse(Order order, OrderResponse response);
  void completeOrder(Order order);
  List<ChatMessage> messagesForOrder(String orderId);
  void sendMessage(Order order, String text);
}

/// City center used for demo geocoding/map centering in both backends.
const LatLng kCityCenter = LatLng(55.7436, 52.3958);

/// Service commission taken from the contractor's payout once real payments
/// are wired up. Display-only in both backends today.
const double kCommissionRatePercent = 12;

/// Set once at startup in main.dart to whichever store is active.
class AppData {
  static late AppDataStore instance;
}
