import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/app_user.dart';
import '../models/order.dart';
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

  Stream<QuerySnapshot<Map<String, dynamic>>> ordersForCustomer(String customerId) {
    return _orders.where('customerId', isEqualTo: customerId).orderBy('createdAt', descending: true).snapshots();
  }

  Stream<DocumentSnapshot<Map<String, dynamic>>> watchOrder(String orderId) {
    return _orders.doc(orderId).snapshots();
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

  Stream<QuerySnapshot<Map<String, dynamic>>> responsesForOrder(String orderId) {
    return _orders.doc(orderId).collection('responses').orderBy('createdAt').snapshots();
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

  Stream<QuerySnapshot<Map<String, dynamic>>> messagesForOrder(String orderId) {
    return _orders.doc(orderId).collection('messages').orderBy('timestamp').snapshots();
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> contractorsForCategory(String categoryId) {
    return _contractors.where('categoryId', isEqualTo: categoryId).snapshots();
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
    });
  }
}
