import 'package:flutter/foundation.dart';
import '../models/video_model.dart';
import '../services/api_service.dart';

class VideoProvider extends ChangeNotifier {
  final List<VideoModel> _videos = [];
  VideoModel? _currentVideo;
  bool _generating = false;
  bool _loadingHistory = false;
  String? _error;

  List<VideoModel> get videos        => List.unmodifiable(_videos);
  VideoModel?      get currentVideo  => _currentVideo;
  bool             get generating    => _generating;
  bool             get loadingHistory => _loadingHistory;
  String?          get error         => _error;

  // ── Generate Video ─────────────────────────────────────────────────────────

  Future<bool> generate(String topic) async {
    _generating = true;
    _error = null;
    notifyListeners();
    try {
      final video = await ApiService.generateVideo(topic);
      _currentVideo = video;
      _videos.insert(0, video);
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      return false;
    } catch (_) {
      _error = 'Network error. Please check your connection.';
      return false;
    } finally {
      _generating = false;
      notifyListeners();
    }
  }

  // ── Load History ───────────────────────────────────────────────────────────

  Future<void> loadHistory() async {
    _loadingHistory = true;
    _error = null;
    notifyListeners();
    try {
      final list = await ApiService.getVideoHistory();
      _videos
        ..clear()
        ..addAll(list);
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load history.';
    } finally {
      _loadingHistory = false;
      notifyListeners();
    }
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  void setCurrentVideo(VideoModel? v) {
    _currentVideo = v;
    notifyListeners();
  }
}
