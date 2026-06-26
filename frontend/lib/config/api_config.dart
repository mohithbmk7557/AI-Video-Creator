class ApiConfig {
  // Change this to your backend URL when deploying
  // For local development use: http://10.0.2.2:8000  (Android emulator)
  // For physical device use:   http://YOUR_LOCAL_IP:8000
  static const String baseUrl = 'http://10.0.2.2:8000';

  // Auth endpoints
  static const String signup        = '$baseUrl/auth/signup';
  static const String login         = '$baseUrl/auth/login';
  static const String forgotPassword = '$baseUrl/auth/forgot-password';

  // Video endpoints
  static const String generateVideo = '$baseUrl/video/generate';
  static const String videoHistory  = '$baseUrl/video/history';
}
