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
/// Contractor tracking/chat auto-replies for the seeded fixture contractors
/// are still simulated client-side exactly like in demo mode. Real
/// contractor accounts (registerAsContractor) place real bids, which the
/// customer sees live via a Firestore snapshot listener on the order's
/// responses -- see _watchResponses.
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
  final Map<String, StreamSubscription<List<OrderResponse>>> _responseSubs = {};

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
      if (existing.role == UserRole.contractor) {
        await _loadOwnContractorProfile(existing.id);
      }
      await _loadOrderHistory();
      notifyListeners();
    }
  }

  /// Restores a contractor's own marketplace listing after a page reload —
  /// otherwise `contractors` only has the seeded fixtures and
  /// myContractorProfile() would look empty even though they registered.
  Future<void> _loadOwnContractorProfile(String uid) async {
    try {
      final mine = await _repo.getContractor('c_owner_$uid');
      if (mine == null) return;
      final index = contractors.indexWhere((c) => c.id == mine.id);
      if (index >= 0) {
        contractors[index] = mine;
      } else {
        contractors.add(mine);
      }
    } catch (e) {
      debugPrint('Failed to load contractor profile: $e');
    }
  }

  /// Restores this customer's past orders from Firestore. Without this, a
  /// page reload would show an empty order list even though the data is
  /// safely persisted server-side. Chat history isn't fetched here --
  /// messagesForOrder arms a live listener the moment ChatScreen actually
  /// reads it, which fetches the same data and stays current besides.
  Future<void> _loadOrderHistory() async {
    if (currentUser == null) return;
    try {
      final loadedOrders = await _repo.getOrdersForCustomer(currentUser!.id);
      orders
        ..clear()
        ..addAll(loadedOrders);

      for (final order in orders) {
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
        } else if (order.status == OrderStatus.newOrder) {
          _watchResponses(order);
        }
      }
    } catch (e) {
      debugPrint('Failed to load order history: $e');
    }
  }

  /// Live-updates [order]'s responses as real contractors bid, instead of
  /// only refreshing on the next full page load. Safe to call more than
  /// once for the same order -- later calls are no-ops.
  void _watchResponses(Order order) {
    if (_responseSubs.containsKey(order.id)) return;
    _responseSubs[order.id] = _repo.watchResponses(order.id).listen(
      (responses) {
        order.responses
          ..clear()
          ..addAll(responses);
        notifyListeners();
      },
      onError: (Object e) => debugPrint('watchResponses failed: $e'),
    );
  }

  void _stopWatchingResponses(String orderId) {
    _responseSubs.remove(orderId)?.cancel();
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
    for (final sub in _responseSubs.values) {
      sub.cancel();
    }
    _responseSubs.clear();
    for (final sub in _messageSubs.values) {
      sub.cancel();
    }
    _messageSubs.clear();
    _openOrdersSub?.cancel();
    _myOrdersSub?.cancel();
    _watchedContractorKey = null;
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
    _watchResponses(order);
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
    if (order.status != OrderStatus.newOrder) return;
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
    _stopWatchingResponses(order.id);
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
    if (order.status != OrderStatus.inProgress) return;
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
  void cancelOrder(Order order) {
    if (order.acceptedContractorId != null) return;
    order.status = OrderStatus.cancelled;
    notifyListeners();
    _persist(_repo.cancelOrder(order.id), 'cancelOrder');
    _stopWatchingResponses(order.id);
  }

  @override
  Future<void> rateOrder(Order order, int stars) async {
    final clamped = stars.clamp(1, 5);
    order.customerRating = clamped;
    notifyListeners();
    await _repo.setOrderRating(order.id, clamped);
  }

  @override
  List<ChatMessage> messagesForOrder(String orderId) {
    _watchMessages(orderId);
    return messages.where((m) => m.orderId == orderId).toList();
  }

  final Map<String, StreamSubscription<List<ChatMessage>>> _messageSubs = {};

  /// Arms live chat for [orderId] on first read. Whichever side didn't
  /// send a given message (customer or the real accepted contractor, in a
  /// completely separate session) would otherwise never see it: their
  /// local `messages` list only ever gets entries they wrote themselves.
  void _watchMessages(String orderId) {
    if (_messageSubs.containsKey(orderId)) return;
    _messageSubs[orderId] = _repo.watchMessages(orderId).listen(
      (fetched) {
        messages.removeWhere((m) => m.orderId == orderId);
        messages.addAll(fetched);
        notifyListeners();
      },
      onError: (Object e) => debugPrint('watchMessages failed: $e'),
    );
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

  @override
  Future<Contractor> registerAsContractor({
    required String categoryId,
    required int price,
    required int etaMinutes,
  }) async {
    final id = 'c_owner_${currentUser!.id}';
    final index = contractors.indexWhere((c) => c.ownerId == currentUser!.id);
    final contractor = Contractor(
      id: id,
      name: currentUser!.name,
      categoryId: categoryId,
      price: price,
      etaMinutes: etaMinutes,
      rating: 5.0,
      position: _jitter(kCityCenter, 0.03),
      ownerId: currentUser!.id,
    );
    if (index >= 0) {
      contractors[index] = contractor;
    } else {
      contractors.add(contractor);
    }
    notifyListeners();
    await _repo.upsertContractor(contractor);
    return contractor;
  }

  @override
  Contractor? myContractorProfile() {
    if (currentUser == null) return null;
    final matches = contractors.where((c) => c.ownerId == currentUser!.id);
    return matches.isEmpty ? null : matches.first;
  }

  /// Merges freshly-fetched orders into the local list, replacing any
  /// stale copy of the same order (by id) rather than duplicating it.
  void _mergeOrders(List<Order> fetched) {
    for (final order in fetched) {
      final index = orders.indexWhere((o) => o.id == order.id);
      if (index >= 0) {
        orders[index] = order;
      } else {
        orders.add(order);
      }
    }
  }

  /// Live subscriptions backing loadContractorFeed, keyed by contractor id
  /// *and* category so editing the category (via the profile edit dialog)
  /// re-subscribes with the new category filter instead of silently
  /// continuing to watch the old one under an unchanged contractor id.
  String? _watchedContractorKey;
  StreamSubscription<List<Order>>? _openOrdersSub;
  StreamSubscription<List<Order>>? _myOrdersSub;

  @override
  Future<void> loadContractorFeed(Contractor contractor) async {
    final key = '${contractor.id}:${contractor.categoryId}';
    if (_watchedContractorKey == key) return;
    _watchedContractorKey = key;
    await _openOrdersSub?.cancel();
    await _myOrdersSub?.cancel();

    _openOrdersSub = _repo.watchOpenOrdersForCategory(contractor.categoryId).listen(
      (fetched) {
        _mergeOrders(fetched);
        notifyListeners();
      },
      onError: (Object e) => debugPrint('watchOpenOrdersForCategory failed: $e'),
    );
    _myOrdersSub = _repo.watchOrdersForContractor(contractor.id).listen(
      (fetched) {
        _mergeOrders(fetched);
        notifyListeners();
      },
      onError: (Object e) => debugPrint('watchOrdersForContractor failed: $e'),
    );
  }

  @override
  List<Order> openOrdersForContractor(Contractor contractor) {
    return orders
        .where((o) =>
            o.categoryId == contractor.categoryId &&
            o.status == OrderStatus.newOrder &&
            !o.responses.any((r) => r.contractorId == contractor.id))
        .toList();
  }

  @override
  List<Order> activeOrdersForContractor(Contractor contractor) {
    return orders.where((o) => o.acceptedContractorId == contractor.id && o.status == OrderStatus.inProgress).toList();
  }

  @override
  List<Order> completedOrdersForContractor(Contractor contractor) {
    return orders.where((o) => o.acceptedContractorId == contractor.id && o.status == OrderStatus.completed).toList();
  }

  @override
  Future<void> respondToOrder(Order order, Contractor contractor, {required int price, required String eta}) async {
    if (order.status != OrderStatus.newOrder) return;
    final response = OrderResponse(
      id: 'r_${DateTime.now().microsecondsSinceEpoch}',
      contractorId: contractor.id,
      contractorName: contractor.name,
      price: price,
      eta: eta,
    );
    order.responses.add(response);
    notifyListeners();
    await _repo.addResponse(
      order.id,
      contractorId: contractor.id,
      contractorName: contractor.name,
      price: price,
      eta: eta,
    );
  }
}
