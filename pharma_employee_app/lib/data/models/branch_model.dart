class BranchAllowedIp {
  final String? id;
  final String ip;
  final String? label;

  const BranchAllowedIp({
    this.id,
    required this.ip,
    this.label,
  });

  factory BranchAllowedIp.fromDynamic(dynamic item) {
    if (item is Map) {
      return BranchAllowedIp(
        id: item['id']?.toString(),
        ip: (item['ip'] ?? '').toString().trim(),
        label: item['label']?.toString(),
      );
    }
    return BranchAllowedIp(
      ip: item?.toString().trim() ?? '',
    );
  }
}

class BranchModel {
  final String id;
  final String name;
  final String? code;
  final String? address;
  final String? phone;
  final double? latitude;
  final double? longitude;
  final double geofenceRadiusMeters;
  final bool ipRestrictionEnabled;
  final List<BranchAllowedIp> allowedIps;

  const BranchModel({
    required this.id,
    required this.name,
    this.code,
    this.address,
    this.phone,
    this.latitude,
    this.longitude,
    this.geofenceRadiusMeters = 50.0,
    this.ipRestrictionEnabled = false,
    this.allowedIps = const [],
  });

  factory BranchModel.fromMap(Map<String, dynamic> map) {
    final rawIps = map['allowedIps'] ?? map['routerIPs'] ?? [];
    final List<BranchAllowedIp> parsedIps = [];
    if (rawIps is List) {
      for (final item in rawIps) {
        if (item != null) {
          final ipObj = BranchAllowedIp.fromDynamic(item);
          if (ipObj.ip.isNotEmpty) {
            parsedIps.add(ipObj);
          }
        }
      }
    }

    final rawRestricted = map['ipRestrictionEnabled'];
    final bool isRestricted = rawRestricted != null
        ? (rawRestricted == true || rawRestricted.toString() == 'true')
        : (parsedIps.isNotEmpty);

    return BranchModel(
      id: String.fromCharCode(0) != map['id'] ? map['id'].toString() : '',
      name: map['name'] ?? map['branchName'] ?? 'الفرع',
      code: map['code']?.toString() ?? map['branchCode']?.toString(),
      address: map['address']?.toString(),
      phone: map['phone']?.toString(),
      latitude: map['latitude'] != null ? double.tryParse(map['latitude'].toString()) : null,
      longitude: map['longitude'] != null ? double.tryParse(map['longitude'].toString()) : null,
      geofenceRadiusMeters: map['geofenceRadiusMeters'] != null 
          ? double.tryParse(map['geofenceRadiusMeters'].toString()) ?? 50.0 
          : 50.0,
      ipRestrictionEnabled: isRestricted,
      allowedIps: parsedIps,
    );
  }
}
