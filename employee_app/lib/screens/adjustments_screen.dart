import 'package:flutter/material.dart';

class AdjustmentsScreen extends StatefulWidget {
  const AdjustmentsScreen({super.key});

  @override
  State<AdjustmentsScreen> createState() => _AdjustmentsScreenState();
}

class _AdjustmentsScreenState extends State<AdjustmentsScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('المكافآت والخصومات'),
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: 2, // Mock data
        itemBuilder: (context, index) {
          final isBonus = index == 0;
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: isBonus ? Colors.green.withOpacity(0.1) : Colors.red.withOpacity(0.1),
                child: Icon(
                  isBonus ? Icons.arrow_upward : Icons.arrow_downward,
                  color: isBonus ? Colors.green : Colors.red,
                ),
              ),
              title: Text(isBonus ? 'مكافأة إضافية' : 'تأخير صباحي'),
              subtitle: Text('التاريخ: 2026-08-0${index + 1}'),
              trailing: Text(
                '${isBonus ? '+' : '-'} 50 ج.م',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: isBonus ? Colors.green : Colors.red,
                ),
                textDirection: TextDirection.ltr,
              ),
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          // Add adjustment logic
        },
        icon: const Icon(Icons.add),
        label: const Text('إضافة تسوية'),
      ),
    );
  }
}
