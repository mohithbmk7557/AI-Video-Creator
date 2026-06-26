class VideoModel {
  final String id;
  final String userId;
  final String topic;
  final String videoUrl;
  final String? thumbnailUrl;
  final DateTime createdAt;

  const VideoModel({
    required this.id,
    required this.userId,
    required this.topic,
    required this.videoUrl,
    this.thumbnailUrl,
    required this.createdAt,
  });

  factory VideoModel.fromJson(Map<String, dynamic> json) => VideoModel(
        id: json['id'] as String,
        userId: json['user_id'] as String,
        topic: json['topic'] as String,
        videoUrl: json['video_url'] as String,
        thumbnailUrl: json['thumbnail_url'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
      );
}
