import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:specai/data/demo_data_store.dart';
import 'package:specai/data/app_data_store.dart';
import 'package:specai/models/app_user.dart';
import 'package:specai/screens/orders/orders_list_screen.dart';

void main() {
  testWidgets('OrdersListScreen updates live when a new order is created elsewhere', (tester) async {
    final store = DemoDataStore.instance;
    AppData.instance = store;

    // DemoDataStore uses real Future.delayed internally; testWidgets runs
    // in a fake-async zone where those never resolve unless real time is
    // allowed to elapse via runAsync.
    await tester.runAsync(() async {
      final code = await store.requestOtp('+79990001122');
      await store.verifyOtp(code!);
      await store.createProfile(name: 'Тест Тестов', role: UserRole.customer);
    });

    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: OrdersListScreen())));
    await tester.pump();

    expect(find.text('Заказов пока нет.\nВыберите технику на вкладке «Каталог», чтобы создать первый заказ.'), findsOneWidget);

    // Create an order AFTER the screen is already mounted — this is exactly
    // the scenario the AnimatedBuilder-in-OrdersListScreen fix targets: the
    // list must refresh without the widget being torn down and rebuilt by
    // an ancestor.
    await store.createOrder(
      categoryId: 'excavator',
      categoryTitle: 'Экскаватор',
      address: 'Тестовый адрес',
      date: DateTime.now(),
      comment: '',
    );

    await tester.pump();

    expect(find.text('Экскаватор'), findsOneWidget);
    expect(find.text('Заказов пока нет.\nВыберите технику на вкладке «Каталог», чтобы создать первый заказ.'), findsNothing);

    // Let the pending simulated-contractor-response timer fire and clear
    // before the test tears down the widget tree.
    await tester.pump(const Duration(seconds: 7));
  });
}
