import 'package:flutter_test/flutter_test.dart';
import 'package:specai/data/app_data_store.dart';
import 'package:specai/data/demo_data_store.dart';
import 'package:specai/models/app_user.dart';
import 'package:specai/models/contractor.dart';
import 'package:specai/models/order.dart';

void main() {
  test('a cancelled order can no longer receive bids or be accepted/completed', () async {
    final store = DemoDataStore.instance;

    final code = await store.requestOtp('+79170000011');
    await store.verifyOtp(code!);
    await store.createProfile(name: 'Гонка Тест', role: UserRole.customer);

    final order = await store.createOrder(
      categoryId: 'loader',
      categoryTitle: 'Погрузчик',
      address: 'г. Заинск, ул. Тестовая, 9',
      date: DateTime.now().add(const Duration(days: 1)),
      comment: '',
    );
    store.cancelOrder(order);
    expect(order.status, OrderStatus.cancelled);

    // A contractor bid landing just after cancellation (the classic race
    // between a live feed and a customer action) must not resurrect the
    // order into a state where it can be accepted or completed.
    final contractor = Contractor(
      id: 'c_race_test',
      name: 'Гонка Исполнитель',
      categoryId: 'loader',
      price: 1000,
      etaMinutes: 10,
      rating: 5,
      position: kCityCenter,
    );
    await store.respondToOrder(order, contractor, price: 1000, eta: '10 мин');
    expect(order.responses, isEmpty, reason: 'no bid should attach to a cancelled order');

    final fakeResponse = OrderResponse(id: 'r_fake', contractorId: contractor.id, contractorName: contractor.name, price: 1000, eta: '10 мин');
    store.acceptResponse(order, fakeResponse);
    expect(order.status, OrderStatus.cancelled, reason: 'cannot accept a response on a cancelled order');

    store.completeOrder(order);
    expect(order.status, OrderStatus.cancelled, reason: 'cannot complete an order that was never accepted');
  });

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
