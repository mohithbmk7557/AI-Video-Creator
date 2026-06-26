# AiVid — Flutter Frontend

AI Video Generator mobile app built with Flutter.

## Prerequisites

- Flutter SDK 3.x ([install guide](https://flutter.dev/docs/get-started/install))
- Dart SDK 3.x (included with Flutter)
- Android Studio or Xcode (for emulator/simulator)

## Setup

```bash
# Install Flutter packages
flutter pub get

# Run on Android emulator
flutter run

# Run on iOS simulator
flutter run -d ios

# Build release APK
flutter build apk --release
```

## Configuration

Edit `lib/config/api_config.dart` to point to your backend:

```dart
// Android emulator → your local machine
static const String baseUrl = 'http://10.0.2.2:8000';

// iOS simulator → your local machine
static const String baseUrl = 'http://localhost:8000';

// Physical device → your machine's local IP
static const String baseUrl = 'http://192.168.1.X:8000';

// Production (after deploying the backend)
static const String baseUrl = 'https://your-backend.com';
```

## Screens

| Screen | File |
|---|---|
| Login | `lib/screens/login_screen.dart` |
| Sign Up | `lib/screens/signup_screen.dart` |
| Forgot Password | `lib/screens/forgot_password_screen.dart` |
| Home / Video Player | `lib/screens/home_screen.dart` |

## Architecture

```
lib/
├── config/         API base URL
├── models/         Data classes (UserModel, VideoModel)
├── providers/      State management (AuthProvider, VideoProvider)
├── screens/        UI screens
├── services/       HTTP calls (ApiService) + secure storage
└── widgets/        Shared widgets (LoadingSpinner, ErrorSnackbar)
```

## Packages Used

| Package | Purpose |
|---|---|
| `http` | REST API calls |
| `flutter_secure_storage` | JWT token storage |
| `provider` | State management |
| `video_player` | In-app video playback |
