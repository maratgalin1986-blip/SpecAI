import 'package:flutter/material.dart';
import '../../data/demo_data_store.dart';
import '../../widgets/spec_ai_logo.dart';
import '../orders/orders_list_screen.dart';
import '../profile/profile_screen.dart';
import 'catalog_tab.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final tabs = [
      const CatalogTab(),
      const OrdersListScreen(),
      const ProfileScreen(),
    ];

    return AnimatedBuilder(
      animation: DemoDataStore.instance,
      builder: (context, _) {
        return Scaffold(
          appBar: AppBar(
            title: const Row(
              children: [
                SpecAiLogo(height: 28),
                SizedBox(width: 10),
                Text('SpecAI'),
              ],
            ),
          ),
          body: tabs[_tab],
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: const [
              NavigationDestination(icon: Icon(Icons.grid_view), label: 'Каталог'),
              NavigationDestination(icon: Icon(Icons.list_alt), label: 'Заказы'),
              NavigationDestination(icon: Icon(Icons.person), label: 'Профиль'),
            ],
          ),
        );
      },
    );
  }
}
