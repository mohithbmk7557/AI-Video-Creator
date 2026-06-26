class UserModel {
  final String userId;
  final String name;
  final String email;
  final String accessToken;

  const UserModel({
    required this.userId,
    required this.name,
    required this.email,
    required this.accessToken,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
        userId: json['user_id'] as String,
        name: json['name'] as String,
        email: json['email'] as String,
        accessToken: json['access_token'] as String,
      );

  Map<String, dynamic> toJson() => {
        'user_id': userId,
        'name': name,
        'email': email,
        'access_token': accessToken,
      };
}
