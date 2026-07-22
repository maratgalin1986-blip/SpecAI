import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:latlong2/latlong.dart';
import '../models/app_user.dart';
import '../models/order.dart';
import '../models/chat_message.dart';
import '../models/contractor.dart';
import '../models/equipment_category.dart';
import '../services/firebase_auth_service.dart';
import '../services/firestore_repository.dart';
import 'app_data_store.dart';

/// Real backend: Firebase Phone Auth + Cloud Firestore. Keeps the same
/// in-session reactive list/notifyListeners shape as DemoDataStore (so
/// screens don't change), while persisting every write to Firestore in
/// the background so data survives and is visible in the Firebase console.
///
/// Contractors are still local fixtures — there's no real supply side
/// (contractor accounts) yet, so responses/tracking/chat replies are
/// simulated client-side exactly like in demo mode, just persisted for real.
class FirebaseDataStore extends ChangeNotifier implements AppDataStore {
  FirebaseDataStore._internal() {
    _seedContractors();
  }
  static final FirebaseDataStore instance = FirebaseDataStore._internal();

  final _auth = FirebaseAuthService();
  final _repo = FirestoreRepository();

  /// Background persistence writes are best-effort: the UI already
  /// reflects the change optimistically, so a transient Firestore error
  /// here should be logged, not surfaced as an unhandled exception.
  void _persist(Future<void> write, String what) {
    write.catchError((Object e) => debugPrint('Firestore write failed ($what): $e'));
  }
  final _random = Random();
  final Map<String, Timer> _trackingTimers = {};

  fb.User? _authUser;
  String? _pendingPhone;

  @override
  AppUser? currentUser;

  @override
  final List<Order> orders = [];
  final List<ChatMessage> messages = [];

  @override
  final List<Contractor> contractors = [];

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
            position: _jitter(kCityCenter, 0.03),
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

  @override
  List<Contractor> contractorsForCategory(String categoryId) {
    return contractors.where((c) => c.categoryId == categoryId).toList();
  }

  @override
  Future<String?> requestOtp(String phone) {
    _pendingPhone = phone;
    final completer = Completer<String?>();
    _auth.requestOtp(
      phone: phone,
      onCodeSent: () {
        if (!completer.isCompleted) completer.complete(null);
      },
      onAutoVerified: (user) async {
        await _onSignedIn(user);
        if (!completer.isCompleted) completer.complete(null);
      },
      onError: (message) {
        if (!completer.isCompleted) completer.completeError(message);
      },
    );
    return completer.future;
  }

  @override
  Future<bool> verifyOtp(String code) async {
    final user = await _auth.verifyOtp(code);
    if (user == null) return false;
    await _onSignedIn(user);
    return true;
  }

  Future<void> _onSignedIn(fb.User user) async {
    _authUser = user;
    final existing = await _repo.getUser(user.uid);
    if (existing != null) {
      currentUser = existing;
      await _loadOrderHistory();
      notifyListeners();
    }
  }

  /// Restores this customer's past orders (and chat history) from
  /// Firestore. Without this, a page reload would show an empty order
  /// list even though the data is safely persisted server-side.
  Future<void> _loadOrderHistory() async {
    if (currentUser == null) return;
    try {
      final loadedOrders = await _repo.getOrdersForCustomer(currentUser!.id);
      orders
        ..clear()
        ..addAll(loadedOrders);

      for (final order in orders) {
        messages.addAll(await _repo.getMessages(order.id));

        if (order.status == OrderStatus.inProgress && !order.contractorArrived) {
          final contractor = contractors.firstWhere(
            (c) => c.id == order.acceptedContractorId,
            orElse: () => Contractor(
              id: order.acceptedContractorId ?? 'unknown',
              name: 'Исполнитель',
              categoryId: order.categoryId,
              price: 0,
              etaMinutes: 20,
              rating: 4.5,
              position: order.contractorPosition ?? kCityCenter,
              status: ContractorStatus.busy,
            ),
          );
          contractor.status = ContractorStatus.busy;
          _startTracking(order, contractor);
        }
      }
    } catch (e) {
      debugPrint('Failed to load order history: $e');
    }
  }

  @override
  bool get hasProfile => currentUser != null;
  @override
  String? get pendingPhone => _pendingPhone ?? _authUser?.phoneNumber;

  @override
  Future<void> createProfile({required String name, required UserRole role}) async {
    final user = AppUser(
      id: _authUser!.uid,
      phone: _authUser!.phoneNumber ?? _pendingPhone ?? '',
      name: name,
      role: role,
    );
    await _repo.upsertUser(user);
    currentUser = user;
    notifyListeners();
  }

  @override
  void signOut() {
    _persist(_auth.signOut(), 'signOut');
    currentUser = null;
    _authUser = null;
    _pendingPhone = null;
    notifyListeners();
  }

  @override
  Future<Order> createOrder({
    required String categoryId,
    required String categoryTitle,
    required String address,
    required DateTime date,
    required String comment,
  }) async {
    final destination = _jitter(kCityCenter, 0.02);
    final docId = await _repo.createOrder(
      customerId: currentUser!.id,
      categoryId: categoryId,
      categoryTitle: categoryTitle,
      address: address,
      date: date,
      comment: comment,
      destinationLat: destination.latitude,
      destinationLng: destination.longitude,
    );
    final order = Order(
      id: docId,
      customerId: currentUser!.id,
      categoryId: categoryId,
      categoryTitle: categoryTitle,
      address: address,
      date: date,
      comment: comment,
      destination: destination,
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
        final response = OrderResponse(
          id: 'r_${DateTime.now().microsecondsSinceEpoch}',
          contractorId: contractor.id,
          contractorName: contractor.name,
          price: contractor.price,
          eta: '${contractor.etaMinutes} мин',
        );
        order.responses.add(response);
        notifyListeners();
        _persist(
          _repo.addResponse(
            order.id,
            contractorId: contractor.id,
            contractorName: contractor.name,
            price: contractor.price,
            eta: '${contractor.etaMinutes} мин',
          ),
          'addResponse',
        );
      });
      delay += 2;
    }
  }

  @override
  List<Order> ordersForCurrentUser() {
    if (currentUser == null) return [];
    return orders.where((o) => o.customerId == currentUser!.id).toList();
  }

  @override
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
        position: _jitter(kCityCenter, 0.05),
      ),
    );
    contractor.status = ContractorStatus.busy;
    order.contractorPosition = contractor.position;
    order.trackingStatus = 'Выехал к вам';
    notifyListeners();
    _persist(_repo.acceptResponse(order.id, response.id, response.contractorId), 'acceptResponse');
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
        _persist(
          _repo.updateContractorPosition(order.id, dest.latitude, dest.longitude, order.trackingStatus, arrived: true),
          'updateContractorPosition',
        );
        timer.cancel();
        _trackingTimers.remove(order.id);
        return;
      }

      final next = LatLng(
        current.latitude + latDiff * 0.08,
        current.longitude + lngDiff * 0.08,
      );
      order.contractorPosition = next;
      order.trackingStatus = distance < 0.006 ? 'Почти на месте' : 'В пути к вам';
      notifyListeners();
      _persist(
        _repo.updateContractorPosition(order.id, next.latitude, next.longitude, order.trackingStatus),
        'updateContractorPosition',
      );
    });
  }

  @override
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
    _persist(_repo.completeOrder(order.id), 'completeOrder');
  }

  @override
  List<ChatMessage> messagesForOrder(String orderId) {
    return messages.where((m) => m.orderId == orderId).toList();
  }

  @override
  void sendMessage(Order order, String text) {
    final message = ChatMessage(
      id: 'm_${DateTime.now().microsecondsSinceEpoch}',
      orderId: order.id,
      senderId: currentUser!.id,
      senderName: currentUser!.name,
      text: text,
      timestamp: DateTime.now(),
    );
    messages.add(message);
    notifyListeners();
    _persist(
      _repo.sendMessage(order.id, senderId: currentUser!.id, senderName: currentUser!.name, text: text),
      'sendMessage',
    );
    _maybeAutoReply(order);
  }

  void _maybeAutoReply(Order order) {
    Future.delayed(const Duration(seconds: 2), () {
      const senderId = 'demo_contractor';
      const senderName = 'Исполнитель';
      const text = 'Принято, буду в указанное время.';
      messages.add(
        ChatMessage(
          id: 'm_${DateTime.now().microsecondsSinceEpoch}',
          orderId: order.id,
          senderId: senderId,
          senderName: senderName,
          text: text,
          timestamp: DateTime.now(),
        ),
      );
      notifyListeners();
      _persist(_repo.sendMessage(order.id, senderId: senderId, senderName: senderName, text: text), 'sendMessage');
    });
  }
}
