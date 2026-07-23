import 'package:flutter/material.dart';
import '../../data/app_data_store.dart';
import '../../models/app_user.dart';
import '../../widgets/spec_ai_logo.dart';
import '../contractor/contractor_jobs_tab.dart';
import '../contractor/contractor_orders_tab.dart';
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
    final isContractor = AppData.instance.currentUser?.role == UserRole.contractor;

    final tabs = isContractor
        ? const [ContractorOrdersTab(), ContractorJobsTab(), ProfileScreen()]
        : const [CatalogTab(), OrdersListScreen(), ProfileScreen()];

    final destinations = isContractor
        ? const [
            NavigationDestination(icon: Icon(Icons.grid_view), label: 'Заказы'),
            NavigationDestination(icon: Icon(Icons.work_outline), label: 'В работе'),
            NavigationDestination(icon: Icon(Icons.person), label: 'Профиль'),
          ]
        : const [
            NavigationDestination(icon: Icon(Icons.grid_view), label: 'Каталог'),
            NavigationDestination(icon: Icon(Icons.list_alt), label: 'Заказы'),
            NavigationDestination(icon: Icon(Icons.person), label: 'Профиль'),
          ];

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
        destinations: destinations,
      ),
    );
  }
}
