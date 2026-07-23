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

  /// Cancels an order that hasn't had a contractor accepted yet.
  void cancelOrder(Order order);

  /// Customer rates the contractor 1-5 stars after the order is completed.
  Future<void> rateOrder(Order order, int stars);

  List<ChatMessage> messagesForOrder(String orderId);
  void sendMessage(Order order, String text);

  /// Creates (or updates) the marketplace listing tied to the current
  /// contractor account, so orders in [categoryId] start showing up in
  /// their "Заказы" feed.
  Future<Contractor> registerAsContractor({
    required String categoryId,
    required int price,
    required int etaMinutes,
  });

  /// The Contractor listing owned by the currently signed-in contractor,
  /// or null if they haven't registered one (or are a customer).
  Contractor? myContractorProfile();

  /// Arms live updates for orders relevant to this contractor (open orders
  /// in their category, plus orders they've been accepted on) into local
  /// state. No-op for the in-memory demo backend, where every order is
  /// already local; for the Firestore backend this is a standing
  /// subscription (safe to call repeatedly -- a second call for the same
  /// contractor is a no-op), not a one-time fetch.
  Future<void> loadContractorFeed(Contractor contractor);

  /// Open orders in the contractor's own category that they haven't
  /// already responded to.
  List<Order> openOrdersForContractor(Contractor contractor);

  /// Orders the contractor is currently working (accepted, not yet
  /// completed).
  List<Order> activeOrdersForContractor(Contractor contractor);

  /// Orders the contractor has finished — used for the commission/earnings
  /// summary on their profile.
  List<Order> completedOrdersForContractor(Contractor contractor);

  Future<void> respondToOrder(Order order, Contractor contractor, {required int price, required String eta});
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
