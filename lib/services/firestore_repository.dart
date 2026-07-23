import 'package:cloud_firestore/cloud_firestore.dart' hide Order;
import 'package:latlong2/latlong.dart';
import '../models/app_user.dart';
import '../models/order.dart';
import '../models/chat_message.dart';
import '../models/contractor.dart';

/// Real Firestore-backed data access. Mirrors the shape of DemoDataStore
/// so it's a drop-in replacement once a real Firebase project is wired up
/// (see README "Подключение реального Firebase").
///
/// Firestore layout:
///   users/{uid}                         -> AppUser
///   contractors/{contractorId}          -> Contractor
///   orders/{orderId}                    -> Order (without responses/messages)
///   orders/{orderId}/responses/{id}     -> OrderResponse
///   orders/{orderId}/messages/{id}      -> ChatMessage
class FirestoreRepository {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> get _users => _db.collection('users');
  CollectionReference<Map<String, dynamic>> get _contractors => _db.collection('contractors');
  CollectionReference<Map<String, dynamic>> get _orders => _db.collection('orders');

  Future<void> upsertUser(AppUser user) {
    return _users.doc(user.id).set({
      'phone': user.phone,
      'name': user.name,
      'role': user.role.name,
    }, SetOptions(merge: true));
  }

  Future<AppUser?> getUser(String uid) async {
    final doc = await _users.doc(uid).get();
    if (!doc.exists) return null;
    final data = doc.data()!;
    return AppUser(
      id: uid,
      phone: data['phone'] as String,
      name: data['name'] as String,
      role: UserRole.values.byName(data['role'] as String),
    );
  }

  Future<String> createOrder({
    required String customerId,
    required String categoryId,
    required String categoryTitle,
    required String address,
    required DateTime date,
    required String comment,
    required double destinationLat,
    required double destinationLng,
  }) async {
    final doc = await _orders.add({
      'customerId': customerId,
      'categoryId': categoryId,
      'categoryTitle': categoryTitle,
      'address': address,
      'date': Timestamp.fromDate(date),
      'comment': comment,
      'status': OrderStatus.newOrder.name,
      'destinationLat': destinationLat,
      'destinationLng': destinationLng,
      'acceptedContractorId': null,
      'contractorLat': null,
      'contractorLng': null,
      'contractorArrived': false,
      'trackingStatus': '',
      'createdAt': FieldValue.serverTimestamp(),
    });
    return doc.id;
  }

  /// Fetches this customer's full order history (including responses),
  /// newest first — used to restore state after a page reload since
  /// FirebaseDataStore otherwise only keeps orders created this session.
  Future<List<Order>> getOrdersForCustomer(String customerId) async {
    final snapshot = await _orders
        .where('customerId', isEqualTo: customerId)
        .orderBy('createdAt', descending: true)
        .get();
    return _ordersFromDocs(snapshot.docs);
  }

  Order _orderFromDoc(DocumentSnapshot<Map<String, dynamic>> doc, List<OrderResponse> responses) {
    final data = doc.data()!;
    final destLat = data['destinationLat'] as double?;
    final destLng = data['destinationLng'] as double?;
    final contractorLat = data['contractorLat'] as double?;
    final contractorLng = data['contractorLng'] as double?;

    return Order(
      id: doc.id,
      customerId: data['customerId'] as String,
      categoryId: data['categoryId'] as String,
      categoryTitle: data['categoryTitle'] as String,
      address: data['address'] as String,
      date: (data['date'] as Timestamp).toDate(),
      comment: data['comment'] as String? ?? '',
      status: OrderStatus.values.byName(data['status'] as String),
      responses: responses,
      acceptedContractorId: data['acceptedContractorId'] as String?,
      destination: destLat != null && destLng != null ? LatLng(destLat, destLng) : null,
      contractorPosition: contractorLat != null && contractorLng != null ? LatLng(contractorLat, contractorLng) : null,
      contractorArrived: data['contractorArrived'] as bool? ?? false,
      trackingStatus: data['trackingStatus'] as String? ?? '',
      customerRating: data['customerRating'] as int?,
    );
  }

  /// Open ("newOrder") orders in [categoryId], for a contractor's feed.
  /// Not scoped to a customer -- security rules gate which orders are
  /// actually visible to a given contractor.
  Future<List<Order>> getOpenOrdersForCategory(String categoryId) async {
    final snapshot = await _orders
        .where('categoryId', isEqualTo: categoryId)
        .where('status', isEqualTo: OrderStatus.newOrder.name)
        .get();
    return _ordersFromDocs(snapshot.docs);
  }

  /// Live version of [getOpenOrdersForCategory] -- a new order landing in
  /// this category, or one leaving it (accepted/cancelled elsewhere), is
  /// reflected without the contractor needing to reopen the tab.
  Stream<List<Order>> watchOpenOrdersForCategory(String categoryId) {
    return _orders
        .where('categoryId', isEqualTo: categoryId)
        .where('status', isEqualTo: OrderStatus.newOrder.name)
        .snapshots()
        .asyncMap((snapshot) => _ordersFromDocs(snapshot.docs));
  }

  /// Orders a contractor has been accepted on (in progress or completed).
  Future<List<Order>> getOrdersForContractor(String contractorId) async {
    final snapshot = await _orders.where('acceptedContractorId', isEqualTo: contractorId).get();
    return _ordersFromDocs(snapshot.docs);
  }

  /// Live version of [getOrdersForContractor] -- an order the contractor is
  /// working shows status/tracking changes as they happen.
  Stream<List<Order>> watchOrdersForContractor(String contractorId) {
    return _orders
        .where('acceptedContractorId', isEqualTo: contractorId)
        .snapshots()
        .asyncMap((snapshot) => _ordersFromDocs(snapshot.docs));
  }

  Future<List<Order>> _ordersFromDocs(List<QueryDocumentSnapshot<Map<String, dynamic>>> docs) async {
    final result = <Order>[];
    for (final doc in docs) {
      final responses = await getResponses(doc.id);
      result.add(_orderFromDoc(doc, responses));
    }
    return result;
  }

  Future<void> addResponse(String orderId, {
    required String contractorId,
    required String contractorName,
    required int price,
    required String eta,
  }) {
    return _orders.doc(orderId).collection('responses').add({
      'contractorId': contractorId,
      'contractorName': contractorName,
      'price': price,
      'eta': eta,
      'accepted': false,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  Future<List<OrderResponse>> getResponses(String orderId) async {
    final snapshot = await _orders.doc(orderId).collection('responses').orderBy('createdAt').get();
    return snapshot.docs.map(_responseFromDoc).toList();
  }

  /// Live bids on an order -- lets a customer watching an order see a real
  /// contractor's response the moment it's submitted, instead of only on
  /// the next full page load (which is all `getResponses` gives you).
  Stream<List<OrderResponse>> watchResponses(String orderId) {
    return _orders.doc(orderId).collection('responses').orderBy('createdAt').snapshots().map(
          (snapshot) => snapshot.docs.map(_responseFromDoc).toList(),
        );
  }

  OrderResponse _responseFromDoc(QueryDocumentSnapshot<Map<String, dynamic>> d) {
    final data = d.data();
    return OrderResponse(
      id: d.id,
      contractorId: data['contractorId'] as String,
      contractorName: data['contractorName'] as String,
      price: data['price'] as int,
      eta: data['eta'] as String,
      accepted: data['accepted'] as bool? ?? false,
    );
  }

  Future<void> acceptResponse(String orderId, String responseId, String contractorId) {
    return _orders.doc(orderId).update({
      'status': OrderStatus.inProgress.name,
      'acceptedContractorId': contractorId,
      'trackingStatus': 'Выехал к вам',
    });
  }

  Future<void> updateContractorPosition(String orderId, double lat, double lng, String trackingStatus, {bool arrived = false}) {
    return _orders.doc(orderId).update({
      'contractorLat': lat,
      'contractorLng': lng,
      'trackingStatus': trackingStatus,
      'contractorArrived': arrived,
    });
  }

  Future<void> completeOrder(String orderId) {
    return _orders.doc(orderId).update({'status': OrderStatus.completed.name});
  }

  Future<void> cancelOrder(String orderId) {
    return _orders.doc(orderId).update({'status': OrderStatus.cancelled.name});
  }

  Future<void> setOrderRating(String orderId, int stars) {
    return _orders.doc(orderId).update({'customerRating': stars});
  }

  Future<void> sendMessage(String orderId, {
    required String senderId,
    required String senderName,
    required String text,
  }) {
    return _orders.doc(orderId).collection('messages').add({
      'senderId': senderId,
      'senderName': senderName,
      'text': text,
      'timestamp': FieldValue.serverTimestamp(),
    });
  }

  Future<List<ChatMessage>> getMessages(String orderId) async {
    final snapshot = await _orders.doc(orderId).collection('messages').orderBy('timestamp').get();
    return snapshot.docs.map((d) {
      final data = d.data();
      final ts = data['timestamp'];
      return ChatMessage(
        id: d.id,
        orderId: orderId,
        senderId: data['senderId'] as String,
        senderName: data['senderName'] as String,
        text: data['text'] as String,
        timestamp: ts is Timestamp ? ts.toDate() : DateTime.now(),
      );
    }).toList();
  }

  /// One-time seed for demo contractors, mirroring DemoDataStore's fixture
  /// data so the real backend has something to show before real supply
  /// partners are onboarded. Safe to call once from a maintenance script.
  Future<void> seedContractor(Contractor c) {
    return _contractors.doc(c.id).set({
      'name': c.name,
      'categoryId': c.categoryId,
      'price': c.price,
      'etaMinutes': c.etaMinutes,
      'rating': c.rating,
      'lat': c.position.latitude,
      'lng': c.position.longitude,
      'status': c.status.name,
      'ownerId': c.ownerId,
    });
  }

  Future<Contractor?> getContractor(String id) async {
    final doc = await _contractors.doc(id).get();
    if (!doc.exists) return null;
    final data = doc.data()!;
    return Contractor(
      id: doc.id,
      name: data['name'] as String,
      categoryId: data['categoryId'] as String,
      price: data['price'] as int,
      etaMinutes: data['etaMinutes'] as int,
      rating: (data['rating'] as num).toDouble(),
      position: LatLng(data['lat'] as double, data['lng'] as double),
      status: ContractorStatus.values.byName(data['status'] as String? ?? 'available'),
      ownerId: data['ownerId'] as String?,
    );
  }

  /// Creates or updates the marketplace listing owned by a real contractor
  /// account (as opposed to the seeded fixtures, which have no owner).
  Future<void> upsertContractor(Contractor c) {
    return _contractors.doc(c.id).set({
      'name': c.name,
      'categoryId': c.categoryId,
      'price': c.price,
      'etaMinutes': c.etaMinutes,
      'rating': c.rating,
      'lat': c.position.latitude,
      'lng': c.position.longitude,
      'status': c.status.name,
      'ownerId': c.ownerId,
    }, SetOptions(merge: true));
  }
}
