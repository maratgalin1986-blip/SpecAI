import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';
import '../models/app_user.dart';
import '../models/order.dart';
import '../models/chat_message.dart';
import '../models/contractor.dart';
import '../models/equipment_category.dart';

/// In-memory demo backend. Stands in for Firebase Auth/Firestore so the
/// full customer -> order -> response -> chat -> completion flow is
/// clickable end-to-end without any external services.
class DemoDataStore extends ChangeNotifier {
  DemoDataStore._internal() {
    _seedContractors();
  }
  static final DemoDataStore instance = DemoDataStore._internal();

  // Naberezhnye Chelny city center — target launch market.
  static const LatLng cityCenter = LatLng(55.7436, 52.3958);

  /// Service commission taken from the contractor's payout once real
  /// payments are wired up. Not charged anywhere yet — display-only.
  static const double commissionRatePercent = 12;

  final Map<String, AppUser> _usersByPhone = {};
  AppUser? currentUser;

  final List<Order> orders = [];
  final List<ChatMessage> messages = [];
  final List<Contractor> contractors = [];

  final _random = Random();
  final Map<String, Timer> _trackingTimers = {};

  String? _pendingPhone;
  String? _pendingCode;

  void _seedContractors() {
    final names = [
      'ИП Хайдаров',
      'СпецТехСервис',
      'ООО «КамСтройТех»',
      'Ринат С.',
      'АвтоКранНЧ',
      'Дамир Т.',
      'СтройМашСервис',
      'Азат М.',
    ];
    int i = 0;
    for (final category in equipmentCategories) {
      final count = 2 + _random.nextInt(2);
      for (var j = 0; j < count; j++) {
        contractors.add(
          Contractor(
            id: 'c_${category.id}_$j',
            name: names[i % names.length],
            categoryId: category.id,
            price: 2500 + _random.nextInt(16) * 500,
            etaMinutes: 10 + _random.nextInt(50),
            rating: 4.0 + _random.nextInt(10) / 10,
            position: _jitter(cityCenter, 0.03),
          ),
        );
        i++;
      }
    }
  }

  LatLng _jitter(LatLng center, double spread) {
    return LatLng(
      center.latitude + (_random.nextDouble() - 0.5) * spread,
      center.longitude + (_random.nextDouble() - 0.5) * spread,
    );
  }

  List<Contractor> contractorsForCategory(String categoryId) {
    return contractors.where((c) => c.categoryId == categoryId).toList();
  }

  Future<String> requestOtp(String phone) async {
    await Future.delayed(const Duration(milliseconds: 400));
    _pendingPhone = phone;
    _pendingCode = (1000 + _random.nextInt(9000)).toString();
    return _pendingCode!;
  }

  Future<bool> verifyOtp(String code) async {
    await Future.delayed(const Duration(milliseconds: 300));
    if (_pendingPhone == null || code != _pendingCode) return false;
    final existing = _usersByPhone[_pendingPhone];
    if (existing != null) {
      currentUser = existing;
      notifyListeners();
    }
    return true;
  }

  bool get hasProfile => currentUser != null;
  String? get pendingPhone => _pendingPhone;

  void createProfile({required String name, required UserRole role}) {
    final phone = _pendingPhone!;
    final user = AppUser(
      id: 'u_${DateTime.now().microsecondsSinceEpoch}',
      phone: phone,
      name: name,
      role: role,
    );
    _usersByPhone[phone] = user;
    currentUser = user;
    notifyListeners();
  }

  void signOut() {
    currentUser = null;
    _pendingPhone = null;
    _pendingCode = null;
    notifyListeners();
  }

  Order createOrder({
    required String categoryId,
    required String categoryTitle,
    required String address,
    required DateTime date,
    required String comment,
  }) {
    final order = Order(
      id: 'o_${DateTime.now().microsecondsSinceEpoch}',
      customerId: currentUser!.id,
      categoryId: categoryId,
      categoryTitle: categoryTitle,
      address: address,
      date: date,
      comment: comment,
      destination: _jitter(cityCenter, 0.02),
    );
    orders.insert(0, order);
    notifyListeners();
    _simulateContractorResponses(order);
    return order;
  }

  void _simulateContractorResponses(Order order) {
    final available = contractorsForCategory(order.categoryId)
        .where((c) => c.status == ContractorStatus.available)
        .toList()
      ..shuffle(_random);
    final picks = available.take(1 + _random.nextInt(2));
    var delay = 2;
    for (final contractor in picks) {
      Future.delayed(Duration(seconds: delay), () {
        order.responses.add(
          OrderResponse(
            id: 'r_${DateTime.now().microsecondsSinceEpoch}',
            contractorId: contractor.id,
            contractorName: contractor.name,
            price: contractor.price,
            eta: '${contractor.etaMinutes} мин',
          ),
        );
        notifyListeners();
      });
      delay += 2;
    }
  }

  List<Order> ordersForCurrentUser() {
    if (currentUser == null) return [];
    return orders.where((o) => o.customerId == currentUser!.id).toList();
  }

  void acceptResponse(Order order, OrderResponse response) {
    for (final r in order.responses) {
      r.accepted = r.id == response.id;
    }
    order.acceptedContractorId = response.contractorId;
    order.status = OrderStatus.inProgress;

    final contractor = contractors.firstWhere(
      (c) => c.id == response.contractorId,
      orElse: () => Contractor(
        id: response.contractorId,
        name: response.contractorName,
        categoryId: order.categoryId,
        price: response.price,
        etaMinutes: 20,
        rating: 4.5,
        position: _jitter(cityCenter, 0.05),
      ),
    );
    contractor.status = ContractorStatus.busy;
    order.contractorPosition = contractor.position;
    order.trackingStatus = 'Выехал к вам';
    notifyListeners();
    _startTracking(order, contractor);
  }

  void _startTracking(Order order, Contractor contractor) {
    _trackingTimers[order.id]?.cancel();
    _trackingTimers[order.id] = Timer.periodic(const Duration(seconds: 1), (timer) {
      final current = order.contractorPosition;
      final dest = order.destination;
      if (current == null || dest == null) {
        timer.cancel();
        return;
      }
      final latDiff = dest.latitude - current.latitude;
      final lngDiff = dest.longitude - current.longitude;
      final distance = sqrt(latDiff * latDiff + lngDiff * lngDiff);

      if (distance < 0.0015) {
        order.contractorPosition = dest;
        order.contractorArrived = true;
        order.trackingStatus = 'Исполнитель на месте';
        notifyListeners();
        timer.cancel();
        _trackingTimers.remove(order.id);
        return;
      }

      order.contractorPosition = LatLng(
        current.latitude + latDiff * 0.08,
        current.longitude + lngDiff * 0.08,
      );
      order.trackingStatus = distance < 0.006 ? 'Почти на месте' : 'В пути к вам';
      notifyListeners();
    });
  }

  void completeOrder(Order order) {
    order.status = OrderStatus.completed;
    _trackingTimers[order.id]?.cancel();
    _trackingTimers.remove(order.id);
    final contractor = contractors.firstWhere(
      (c) => c.id == order.acceptedContractorId,
      orElse: () => contractors.first,
    );
    contractor.status = ContractorStatus.available;
    notifyListeners();
  }

  List<ChatMessage> messagesForOrder(String orderId) {
    return messages.where((m) => m.orderId == orderId).toList();
  }

  void sendMessage(Order order, String text) {
    messages.add(
      ChatMessage(
        id: 'm_${DateTime.now().microsecondsSinceEpoch}',
        orderId: order.id,
        senderId: currentUser!.id,
        senderName: currentUser!.name,
        text: text,
        timestamp: DateTime.now(),
      ),
    );
    notifyListeners();
    _maybeAutoReply(order);
  }

  void _maybeAutoReply(Order order) {
    Future.delayed(const Duration(seconds: 2), () {
      messages.add(
        ChatMessage(
          id: 'm_${DateTime.now().microsecondsSinceEpoch}',
          orderId: order.id,
          senderId: 'demo_contractor',
          senderName: 'Исполнитель',
          text: 'Принято, буду в указанное время.',
          timestamp: DateTime.now(),
        ),
      );
      notifyListeners();
    });
  }
}
