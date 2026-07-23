import 'package:flutter/material.dart';

/// Small square mark (excavator on a navy tile) for toolbars and app icons.
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

/// Full hero mark: the whole equipment-fleet illustration plus the SpecAI
/// wordmark, for the login screen and other prominent placements.
class SpecAiHeroLogo extends StatelessWidget {
  final double width;
  const SpecAiHeroLogo({super.key, this.width = 220});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/logo/png/logo-full.png',
      width: width,
      errorBuilder: (context, error, stackTrace) => Icon(Icons.construction, size: width * 0.4),
    );
  }
}
