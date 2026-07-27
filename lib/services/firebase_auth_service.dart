import 'package:firebase_auth/firebase_auth.dart';

/// Real phone-number auth backed by Firebase Auth. Mirrors the call shape of
/// DemoDataStore.requestOtp/verifyOtp so screens barely need to change once
/// this is wired in behind a real Firebase project.
class FirebaseAuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  String? _verificationId;

  User? get currentUser => _auth.currentUser;
  Stream<User?> get authStateChanges => _auth.authStateChanges();

  /// Starts phone verification. [onCodeSent] fires once Firebase has sent
  /// the SMS; [onAutoVerified] fires if Android auto-retrieves the code
  /// without user input (sign-in happens immediately in that case).
  Future<void> requestOtp({
    required String phone,
    required void Function() onCodeSent,
    required void Function(User user) onAutoVerified,
    required void Function(String message) onError,
  }) async {
    try {
      await _auth.verifyPhoneNumber(
        phoneNumber: phone,
        timeout: const Duration(seconds: 60),
        verificationCompleted: (credential) async {
          final result = await _auth.signInWithCredential(credential);
          if (result.user != null) onAutoVerified(result.user!);
        },
        verificationFailed: (e) => onError('${e.code}: ${e.message ?? e.toString()}'),
        codeSent: (verificationId, resendToken) {
          _verificationId = verificationId;
          onCodeSent();
        },
        codeAutoRetrievalTimeout: (verificationId) {
          _verificationId = verificationId;
        },
      );
    } catch (e) {
      // verifyPhoneNumber can throw directly (e.g. a reCAPTCHA/JS-interop
      // failure) instead of routing through verificationFailed above --
      // without this, the caller's completer would never fire and the
      // UI would hang on the loading spinner forever instead of showing
      // an error.
      onError(e.toString());
    }
  }

  Future<User?> verifyOtp(String smsCode) async {
    if (_verificationId == null) return null;
    final credential = PhoneAuthProvider.credential(
      verificationId: _verificationId!,
      smsCode: smsCode,
    );
    final result = await _auth.signInWithCredential(credential);
    return result.user;
  }

  Future<void> signOut() => _auth.signOut();
}
