import 'package:flutter/foundation.dart';
import '../models/user_model.dart';
import '../services/api_service.dart';
import '../services/storage_service.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthProvider extends ChangeNotifier {
  AuthStatus _status = AuthStatus.unknown;
  UserModel? _user;
  bool _loading = false;
  String? _error;

  AuthStatus get status  => _status;
  UserModel?  get user   => _user;
  bool        get loading => _loading;
  String?     get error  => _error;
  bool        get isAuthenticated => _status == AuthStatus.authenticated;

  // ── Init: restore session from secure storage ──────────────────────────────

  Future<void> restoreSession() async {
    final user = await StorageService.getUser();
    if (user != null) {
      _user = user;
      _status = AuthStatus.authenticated;
    } else {
      _status = AuthStatus.unauthenticated;
    }
    notifyListeners();
  }

  // ── Sign Up ────────────────────────────────────────────────────────────────

  Future<bool> signup({
    required String name,
    required String email,
    required String password,
  }) async {
    _setLoading(true);
    try {
      final user = await ApiService.signup(name: name, email: email, password: password);
      await _saveSession(user);
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      notifyListeners();
      return false;
    } catch (_) {
      _error = 'Network error. Please check your connection.';
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  Future<bool> login({required String email, required String password}) async {
    _setLoading(true);
    try {
      final user = await ApiService.login(email: email, password: password);
      await _saveSession(user);
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      notifyListeners();
      return false;
    } catch (_) {
      _error = 'Network error. Please check your connection.';
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  // ── Forgot Password ────────────────────────────────────────────────────────

  Future<String?> forgotPassword(String email) async {
    _setLoading(true);
    try {
      final msg = await ApiService.forgotPassword(email);
      return msg;
    } on ApiException catch (e) {
      _error = e.message;
      notifyListeners();
      return null;
    } catch (_) {
      _error = 'Network error. Please check your connection.';
      notifyListeners();
      return null;
    } finally {
      _setLoading(false);
    }
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  Future<void> logout() async {
    await StorageService.clearAll();
    _user = null;
    _status = AuthStatus.unauthenticated;
    _error = null;
    notifyListeners();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  void clearError() {
    _error = null;
    notifyListeners();
  }

  Future<void> _saveSession(UserModel user) async {
    await StorageService.saveToken(user.accessToken);
    await StorageService.saveUser(user);
    _user = user;
    _status = AuthStatus.authenticated;
    _error = null;
    notifyListeners();
  }

  void _setLoading(bool value) {
    _loading = value;
    notifyListeners();
  }
}
