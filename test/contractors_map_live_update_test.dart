import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:specai/data/demo_data_store.dart';
import 'package:specai/data/app_data_store.dart';
import 'package:specai/models/app_user.dart';
import 'package:specai/models/order.dart';
import 'package:specai/screens/map/contractors_map_screen.dart';

bool _isBusyMarkerContainer(Widget w) {
  return w is Container && w.decoration is BoxDecoration && (w.decoration as BoxDecoration).color == Colors.grey;
}

void main() {
  testWidgets('ContractorsMapScreen reflects a contractor going busy without remounting', (tester) async {
    final store = DemoDataStore.instance;
    AppData.instance = store;

    late Order order;
    await tester.runAsync(() async {
      final code = await store.requestOtp('+79170000099');
      await store.verifyOtp(code!);
      await store.createProfile(name: 'Карта Тест', role: UserRole.customer);
      order = await store.createOrder(
        categoryId: 'excavator',
        categoryTitle: 'Экскаватор',
        address: 'Тестовый адрес',
        date: DateTime.now(),
        comment: '',
      );
    });

    await tester.pumpWidget(
      const MaterialApp(home: ContractorsMapScreen(initialCategoryId: 'excavator')),
    );
    await tester.pump();

    // Every seeded excavator contractor starts available -- no busy (grey)
    // marker should exist yet.
    expect(find.byWidgetPredicate(_isBusyMarkerContainer), findsNothing);

    // Wait for a simulated response and accept it -- this mutates the
    // contractor's status to busy and calls notifyListeners() -- all while
    // ContractorsMapScreen stays mounted the whole time, exactly the
    // scenario the AnimatedBuilder-in-ContractorsMapScreen fix targets.
    await tester.runAsync(() async {
      while (order.responses.isEmpty) {
        await Future<void>.delayed(const Duration(milliseconds: 200));
      }
    });
    store.acceptResponse(order, order.responses.first);
    await tester.pump();

    expect(find.byWidgetPredicate(_isBusyMarkerContainer), findsOneWidget);

    // acceptResponse started a periodic tracking timer; completeOrder
    // cancels it so no timer is left pending once the widget tree is torn
    // down at the end of the test.
    store.completeOrder(order);
  });
}
