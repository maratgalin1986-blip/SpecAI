enum UserRole { customer, contractor }

class AppUser {
  final String id;
  final String phone;
  String name;
  UserRole role;

  AppUser({required this.id, required this.phone, required this.name, required this.role});
}
