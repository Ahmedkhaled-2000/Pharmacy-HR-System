enum NotificationType {
  approval,
  shift,
  salary,
  penalty,
  general;

  String get iconName {
    switch (this) {
      case NotificationType.approval:
        return 'check_circle';
      case NotificationType.shift:
        return 'schedule';
      case NotificationType.salary:
        return 'payments';
      case NotificationType.penalty:
        return 'warning';
      case NotificationType.general:
        return 'notifications';
    }
  }
}

class InAppNotificationModel {
  final String id;
  final String title;
  final String body;
  final NotificationType type;
  final DateTime timestamp;
  final bool isRead;
  final String? targetTab;
  final Map<String, dynamic>? payload;

  const InAppNotificationModel({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    required this.timestamp,
    this.isRead = false,
    this.targetTab,
    this.payload,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'body': body,
    'type': type.name,
    'timestamp': timestamp.toIso8601String(),
    'isRead': isRead,
    'targetTab': targetTab,
    'payload': payload,
  };

  factory InAppNotificationModel.fromJson(Map<String, dynamic> json) => InAppNotificationModel(
    id: json['id'] as String,
    title: json['title'] as String? ?? '',
    body: json['body'] as String? ?? '',
    type: NotificationType.values.firstWhere(
      (e) => e.name == json['type'],
      orElse: () => NotificationType.general,
    ),
    timestamp: DateTime.parse(json['timestamp'] as String),
    isRead: json['isRead'] as bool? ?? false,
    targetTab: json['targetTab'] as String?,
    payload: json['payload'] as Map<String, dynamic>?,
  );
}

