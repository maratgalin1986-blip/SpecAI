import 'package:flutter_test/flutter_test.dart';
import 'package:specai/data/demo_data_store.dart';
import 'package:specai/models/app_user.dart';
import 'package:specai/models/order.dart';

void main() {
  test('full customer flow: auth -> order -> response -> accept -> tracking -> chat -> complete', () async {
    final store = DemoDataStore.instance;

    final code = await store.requestOtp('+79272428088');
    expect(code, isNotNull);
    expect(code!.length, 4);

    final ok = await store.verifyOtp(code);
    expect(ok, isTrue);
    expect(store.hasProfile, isFalse);

    await store.createProfile(name: 'Марат Галин', role: UserRole.customer);
    expect(store.hasProfile, isTrue);
    expect(store.currentUser!.name, 'Марат Галин');

    final order = await store.createOrder(
      categoryId: 'excavator',
      categoryTitle: 'Экскаватор',
      address: 'г. Набережные Челны, пр. Мира, 10',
      date: DateTime.now().add(const Duration(days: 1)),
      comment: 'Тестовый заказ',
    );
    expect(store.ordersForCurrentUser(), contains(order));
    expect(order.status, OrderStatus.newOrder);
    expect(order.destination, isNotNull);

    // Simulated contractor responses land within a few seconds.
    await Future.delayed(const Duration(seconds: 7));
    expect(order.responses, isNotEmpty, reason: 'at least one demo contractor should respond');

    final response = order.responses.first;
    store.acceptResponse(order, response);
    expect(order.status, OrderStatus.inProgress);
    expect(order.acceptedContractorId, response.contractorId);
    expect(order.contractorPosition, isNotNull);
    expect(order.trackingStatus, isNotEmpty);

    // Tracking timer should move the contractor closer over a couple of ticks.
    final startPos = order.contractorPosition!;
    await Future.delayed(const Duration(seconds: 3));
    expect(order.contractorPosition, isNot(equals(startPos)), reason: 'contractor should move toward destination');

    store.sendMessage(order, 'Здравствуйте, жду вас по адресу.');
    expect(store.messagesForOrder(order.id), isNotEmpty);
    expect(store.messagesForOrder(order.id).first.text, contains('жду вас'));

    await Future.delayed(const Duration(seconds: 3));
    expect(store.messagesForOrder(order.id).length, greaterThanOrEqualTo(2), reason: 'demo contractor should auto-reply');

    store.completeOrder(order);
    expect(order.status, OrderStatus.completed);

    expect(order.customerRating, isNull);
    await store.rateOrder(order, 5);
    expect(order.customerRating, 5);
  }, timeout: const Timeout(Duration(seconds: 30)));
}
