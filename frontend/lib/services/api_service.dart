import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import '../models/user_model.dart';
import '../models/video_model.dart';
import 'storage_service.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  ApiException(this.message, {this.statusCode});

  @override
  String toString() => message;
}

class ApiService {
  static const _headers = {'Content-Type': 'application/json'};

  static Future<Map<String, String>> _authHeaders() async {
    final token = await StorageService.getToken();
    return {
      ..._headers,
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  static Map<String, dynamic> _parseBody(http.Response res) {
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      final detail = body['detail'] ?? body['message'] ?? 'Unknown error';
      throw ApiException(detail.toString(), statusCode: res.statusCode);
    }
    return body;
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  static Future<UserModel> signup({
    required String name,
    required String email,
    required String password,
  }) async {
    final res = await http
        .post(
          Uri.parse(ApiConfig.signup),
          headers: _headers,
          body: jsonEncode({'name': name, 'email': email, 'password': password}),
        )
        .timeout(const Duration(seconds: 15));
    return UserModel.fromJson(_parseBody(res));
  }

  static Future<UserModel> login({
    required String email,
    required String password,
  }) async {
    final res = await http
        .post(
          Uri.parse(ApiConfig.login),
          headers: _headers,
          body: jsonEncode({'email': email, 'password': password}),
        )
        .timeout(const Duration(seconds: 15));
    return UserModel.fromJson(_parseBody(res));
  }

  static Future<String> forgotPassword(String email) async {
    final res = await http
        .post(
          Uri.parse(ApiConfig.forgotPassword),
          headers: _headers,
          body: jsonEncode({'email': email}),
        )
        .timeout(const Duration(seconds: 15));
    final body = _parseBody(res);
    return body['message'] as String;
  }

  // ── Video ──────────────────────────────────────────────────────────────────

  static Future<VideoModel> generateVideo(String topic) async {
    final res = await http
        .post(
          Uri.parse(ApiConfig.generateVideo),
          headers: await _authHeaders(),
          body: jsonEncode({'topic': topic}),
        )
        .timeout(const Duration(seconds: 30));
    return VideoModel.fromJson(_parseBody(res));
  }

  static Future<List<VideoModel>> getVideoHistory() async {
    final res = await http
        .get(
          Uri.parse(ApiConfig.videoHistory),
          headers: await _authHeaders(),
        )
        .timeout(const Duration(seconds: 15));
    final body = _parseBody(res);
    final list = body['videos'] as List<dynamic>;
    return list
        .map((v) => VideoModel.fromJson(v as Map<String, dynamic>))
        .toList();
  }
}
