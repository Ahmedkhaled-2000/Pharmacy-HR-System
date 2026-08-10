class Employee {
  final String id;
  final String code;
  final String username;
  final String name;
  final String phone;
  final String jobTitle;
  final double salary;
  final double workHoursPerDay;
  final double workDaysPerMonth;
  final String photoUrl;
  final String createdAt;

  Employee({
    required this.id,
    required this.code,
    required this.username,
    required this.name,
    required this.phone,
    required this.jobTitle,
    required this.salary,
    required this.workHoursPerDay,
    required this.workDaysPerMonth,
    required this.photoUrl,
    required this.createdAt,
  });

  factory Employee.fromJson(Map<String, dynamic> json) {
    return Employee(
      id: json['id']?.toString() ?? '',
      code: json['code']?.toString() ?? '',
      username: json['username']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      phone: json['phone']?.toString() ?? '',
      jobTitle: json['jobTitle']?.toString() ?? '',
      salary: double.tryParse(json['salary']?.toString() ?? '0') ?? 0.0,
      workHoursPerDay: double.tryParse(json['workHoursPerDay']?.toString() ?? '0') ?? 0.0,
      workDaysPerMonth: double.tryParse(json['workDaysPerMonth']?.toString() ?? '0') ?? 0.0,
      photoUrl: json['photoUrl']?.toString() ?? '',
      createdAt: json['createdAt']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'code': code,
      'username': username,
      'name': name,
      'phone': phone,
      'jobTitle': jobTitle,
      'salary': salary,
      'workHoursPerDay': workHoursPerDay,
      'workDaysPerMonth': workDaysPerMonth,
      'photoUrl': photoUrl,
      'createdAt': createdAt,
    };
  }
}
