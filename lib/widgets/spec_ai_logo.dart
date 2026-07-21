import 'package:flutter/material.dart';

class SpecAiLogo extends StatelessWidget {
  final double height;
  const SpecAiLogo({super.key, this.height = 36});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/logo/png/icon-64.png',
      height: height,
      errorBuilder: (context, error, stackTrace) => Icon(Icons.construction, size: height),
    );
  }
}
