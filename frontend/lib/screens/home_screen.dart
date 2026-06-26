import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:video_player/video_player.dart';
import '../providers/auth_provider.dart';
import '../providers/video_provider.dart';
import '../models/video_model.dart';
import '../widgets/loading_spinner.dart';
import '../widgets/error_snackbar.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _topicCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<VideoProvider>().loadHistory();
    });
  }

  @override
  void dispose() {
    _topicCtrl.dispose();
    super.dispose();
  }

  Future<void> _generate() async {
    final topic = _topicCtrl.text.trim();
    if (topic.isEmpty) return;
    FocusScope.of(context).unfocus();
    _topicCtrl.clear();

    final vp = context.read<VideoProvider>();
    final ok = await vp.generate(topic);
    if (!mounted) return;
    if (!ok && vp.error != null) {
      showErrorSnackbar(context, vp.error!);
      vp.clearError();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth  = context.watch<AuthProvider>();
    final video = context.watch<VideoProvider>();

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: const Color(0xFF3D35A8),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.video_library_rounded,
                  color: Colors.white, size: 16),
            ),
            const SizedBox(width: 10),
            const Text(
              'AiVid',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: Color(0xFF111827),
              ),
            ),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            icon: CircleAvatar(
              radius: 16,
              backgroundColor: const Color(0xFF3D35A8),
              child: Text(
                auth.user?.name.substring(0, 1).toUpperCase() ?? 'U',
                style: const TextStyle(color: Colors.white,
                    fontWeight: FontWeight.w600, fontSize: 14),
              ),
            ),
            onSelected: (v) {
              if (v == 'logout') auth.logout();
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                enabled: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(auth.user?.name ?? '',
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, color: Color(0xFF111827))),
                    Text(auth.user?.email ?? '',
                        style: const TextStyle(
                            fontSize: 12, color: Color(0xFF6B7280))),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'logout',
                child: Row(
                  children: [
                    Icon(Icons.logout_rounded, size: 18, color: Color(0xFF6B7280)),
                    SizedBox(width: 8),
                    Text('Sign out'),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: [
          // ── Chat / history area ─────────────────────────────────────────────
          Expanded(
            child: video.loadingHistory
                ? const LoadingSpinner(message: 'Loading your videos…')
                : video.videos.isEmpty && !video.generating
                    ? _buildEmptyState()
                    : _buildVideoList(video),
          ),

          // ── Generating indicator ────────────────────────────────────────────
          if (video.generating)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              color: const Color(0xFFF7F7F8),
              child: Row(
                children: [
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                        color: Color(0xFF3D35A8), strokeWidth: 2),
                  ),
                  const SizedBox(width: 10),
                  const Text('Generating your video…',
                      style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                ],
              ),
            ),

          // ── Input bar ───────────────────────────────────────────────────────
          _buildInputBar(video),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: const Color(0xFFEEEDFC),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.video_library_outlined,
                color: Color(0xFF3D35A8), size: 36),
          ),
          const SizedBox(height: 20),
          const Text(
            'Generate your first video',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: Color(0xFF111827),
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Type a topic below and tap Send',
            style: TextStyle(fontSize: 14, color: Color(0xFF6B7280)),
          ),
        ],
      ),
    );
  }

  Widget _buildVideoList(VideoProvider vp) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: vp.videos.length,
      itemBuilder: (context, index) {
        final v = vp.videos[index];
        return _VideoCard(video: v);
      },
    );
  }

  Widget _buildInputBar(VideoProvider vp) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Color(0xFFE5E5E5))),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _topicCtrl,
              enabled: !vp.generating,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _generate(),
              decoration: InputDecoration(
                hintText: 'Enter a topic… e.g. "Climate change"',
                hintStyle: const TextStyle(color: Color(0xFF9CA3AF), fontSize: 14),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                filled: true,
                fillColor: const Color(0xFFF7F7F8),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: Color(0xFFE5E5E5)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: Color(0xFFE5E5E5)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide:
                      const BorderSide(color: Color(0xFF3D35A8), width: 1.5),
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          GestureDetector(
            onTap: vp.generating ? null : _generate,
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: vp.generating
                    ? const Color(0xFFD1D5DB)
                    : const Color(0xFF3D35A8),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Video card with inline player ─────────────────────────────────────────────

class _VideoCard extends StatefulWidget {
  final VideoModel video;
  const _VideoCard({required this.video});

  @override
  State<_VideoCard> createState() => _VideoCardState();
}

class _VideoCardState extends State<_VideoCard> {
  VideoPlayerController? _ctrl;
  bool _initialized = false;
  bool _expanded = false;

  Future<void> _initPlayer() async {
    _ctrl = VideoPlayerController.networkUrl(
      Uri.parse(widget.video.videoUrl),
    );
    await _ctrl!.initialize();
    if (mounted) setState(() => _initialized = true);
  }

  @override
  void dispose() {
    _ctrl?.dispose();
    super.dispose();
  }

  void _toggle() {
    if (!_expanded) {
      setState(() => _expanded = true);
      _initPlayer().then((_) => _ctrl?.play());
    } else {
      if (_ctrl?.value.isPlaying == true) {
        _ctrl?.pause();
      } else {
        _ctrl?.play();
      }
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: const Color(0xFFF9F9FB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E5E5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header ──────────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                const Icon(Icons.movie_outlined,
                    size: 18, color: Color(0xFF3D35A8)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    widget.video.topic,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF111827),
                    ),
                  ),
                ),
                Text(
                  _timeAgo(widget.video.createdAt),
                  style: const TextStyle(
                      fontSize: 12, color: Color(0xFF9CA3AF)),
                ),
              ],
            ),
          ),

          // ── Player / thumbnail ───────────────────────────────────────────────
          GestureDetector(
            onTap: _toggle,
            child: Container(
              margin: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              height: 200,
              decoration: BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.circular(8),
              ),
              clipBehavior: Clip.hardEdge,
              child: _expanded && _initialized
                  ? Stack(
                      alignment: Alignment.center,
                      children: [
                        AspectRatio(
                          aspectRatio: _ctrl!.value.aspectRatio,
                          child: VideoPlayer(_ctrl!),
                        ),
                        if (!_ctrl!.value.isPlaying)
                          Container(
                            width: 48,
                            height: 48,
                            decoration: const BoxDecoration(
                              color: Color(0x88000000),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.play_arrow_rounded,
                                color: Colors.white, size: 28),
                          ),
                      ],
                    )
                  : _expanded
                      ? const Center(
                          child: CircularProgressIndicator(
                              color: Colors.white, strokeWidth: 2))
                      : Stack(
                          alignment: Alignment.center,
                          children: [
                            if (widget.video.thumbnailUrl != null)
                              Positioned.fill(
                                child: Image.network(
                                  widget.video.thumbnailUrl!,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => const SizedBox(),
                                ),
                              ),
                            Container(
                              width: 52,
                              height: 52,
                              decoration: const BoxDecoration(
                                color: Color(0x993D35A8),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.play_arrow_rounded,
                                  color: Colors.white, size: 30),
                            ),
                          ],
                        ),
            ),
          ),
        ],
      ),
    );
  }

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}
