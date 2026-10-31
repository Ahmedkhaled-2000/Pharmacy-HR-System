class BylawArticleModel {
  final String id;
  final String articleNumber;
  final String title;
  final String category; // 'attendance' | 'conduct' | 'duties' | 'penalties'
  final String description;
  final List<String> penaltyTiers;

  const BylawArticleModel({
    required this.id,
    required this.articleNumber,
    required this.title,
    required this.category,
    required this.description,
    this.penaltyTiers = const [],
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'articleNumber': articleNumber,
    'title': title,
    'category': category,
    'description': description,
    'penaltyTiers': penaltyTiers,
  };

  factory BylawArticleModel.fromJson(Map<String, dynamic> json) => BylawArticleModel(
    id: json['id'] as String,
    articleNumber: json['articleNumber'] as String? ?? '',
    title: json['title'] as String? ?? '',
    category: json['category'] as String? ?? 'general',
    description: json['description'] as String? ?? '',
    penaltyTiers: (json['penaltyTiers'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? const [],
  );
}

