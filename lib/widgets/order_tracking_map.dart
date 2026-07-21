import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import '../data/demo_data_store.dart';
import '../models/order.dart';

class OrderTrackingMap extends StatelessWidget {
  final Order order;
  const OrderTrackingMap({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    final dest = order.destination ?? DemoDataStore.cityCenter;
    final contractorPos = order.contractorPosition;

    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        height: 220,
        child: FlutterMap(
          options: MapOptions(
            initialCenter: dest,
            initialZoom: 13,
            interactionOptions: const InteractionOptions(flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag),
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.specai.app',
            ),
            if (contractorPos != null)
              PolylineLayer(
                polylines: [
                  Polyline(points: [contractorPos, dest], color: Colors.blue, strokeWidth: 3),
                ],
              ),
            MarkerLayer(
              markers: [
                Marker(
                  point: dest,
                  width: 40,
                  height: 40,
                  child: const Icon(Icons.location_on, color: Color(0xFF111827), size: 36),
                ),
                if (contractorPos != null)
                  Marker(
                    point: contractorPos,
                    width: 40,
                    height: 40,
                    child: const Icon(Icons.local_shipping, color: Colors.blue, size: 30),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
