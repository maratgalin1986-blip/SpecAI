import 'package:flutter_test/flutter_test.dart';
import 'package:specai/data/demo_data_store.dart';
import 'package:specai/models/app_user.dart';
import 'package:specai/models/order.dart';

void main() {
  test('a customer can cancel an order that has no accepted contractor yet', () async {
    final store = DemoDataStore.instance;

    final code = await store.requestOtp('+79170000010');
    await store.verifyOtp(code!);
    await store.createProfile(name: 'Отменяющий Тест', role: UserRole.customer);

    final order = await store.createOrder(
      categoryId: 'crane',
      categoryTitle: 'Автокран',
      address: 'г. Нижнекамск, ул. Тестовая, 5',
      date: DateTime.now().add(const Duration(days: 1)),
      comment: '',
    );
    expect(order.status, OrderStatus.newOrder);

    store.cancelOrder(order);
    expect(order.status, OrderStatus.cancelled);

    // Cancelling again (or once a contractor is accepted) is a no-op --
    // acceptedContractorId is still null here, but the guard exists so an
    // in-progress order can never be silently cancelled out from under an
    // en-route contractor.
    order.acceptedContractorId = 'someone';
    order.status = OrderStatus.inProgress;
    store.cancelOrder(order);
    expect(order.status, OrderStatus.inProgress, reason: 'cannot cancel once a contractor is accepted');
  });
}
