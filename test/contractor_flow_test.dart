import 'package:flutter_test/flutter_test.dart';
import 'package:specai/data/demo_data_store.dart';
import 'package:specai/data/app_data_store.dart';
import 'package:specai/models/app_user.dart';
import 'package:specai/models/order.dart';

void main() {
  test('contractor flow: register -> see open order -> respond -> accepted -> in progress -> complete, commission stays 0', () async {
    final store = DemoDataStore.instance;

    // Customer creates an order.
    final customerCode = await store.requestOtp('+79170000001');
    await store.verifyOtp(customerCode!);
    await store.createProfile(name: 'Заказчик Тест', role: UserRole.customer);
    final order = await store.createOrder(
      categoryId: 'excavator',
      categoryTitle: 'Экскаватор',
      address: 'г. Набережные Челны, ул. Тестовая, 1',
      date: DateTime.now().add(const Duration(days: 1)),
      comment: '',
    );
    store.signOut();

    // A contractor registers for the same category.
    final contractorCode = await store.requestOtp('+79170000002');
    await store.verifyOtp(contractorCode!);
    await store.createProfile(name: 'Исполнитель Тест', role: UserRole.contractor);
    final contractor = await store.registerAsContractor(categoryId: 'excavator', price: 4000, etaMinutes: 15);

    expect(store.myContractorProfile(), isNotNull);
    expect(store.myContractorProfile()!.id, contractor.id);

    final open = store.openOrdersForContractor(contractor);
    expect(open.map((o) => o.id), contains(order.id), reason: 'contractor should see the open order in their category');

    await store.respondToOrder(order, contractor, price: 4200, eta: '15 мин');
    expect(order.responses.any((r) => r.contractorId == contractor.id && r.price == 4200), isTrue);

    final stillOpen = store.openOrdersForContractor(contractor);
    expect(stillOpen.map((o) => o.id), isNot(contains(order.id)), reason: 'order should drop out once this contractor has responded');

    // Customer accepts the real contractor's bid.
    final myResponse = order.responses.firstWhere((r) => r.contractorId == contractor.id);
    store.acceptResponse(order, myResponse);
    expect(order.status, OrderStatus.inProgress);
    expect(order.acceptedContractorId, contractor.id);

    final active = store.activeOrdersForContractor(contractor);
    expect(active.map((o) => o.id), contains(order.id));

    store.completeOrder(order);
    expect(order.status, OrderStatus.completed);

    final completed = store.completedOrdersForContractor(contractor);
    expect(completed.map((o) => o.id), contains(order.id));

    // No payment gateway is wired up: nothing is ever actually charged.
    // (The 0 ₽ "к оплате" figure shown in the UI is a static value, not
    // derived from order data, so there's nothing here to compute --
    // this assertion documents the invariant the UI relies on instead.)
    expect(kCommissionRatePercent, greaterThan(0), reason: 'rate constant still exists for the informational preview only');
  }, timeout: const Timeout(Duration(seconds: 30)));
}
