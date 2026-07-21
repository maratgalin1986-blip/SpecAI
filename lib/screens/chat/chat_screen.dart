import 'package:flutter/material.dart';
import '../../data/demo_data_store.dart';

class ChatScreen extends StatefulWidget {
  final String orderId;
  const ChatScreen({super.key, required this.orderId});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _controller = TextEditingController();

  void _send(order) {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    DemoDataStore.instance.sendMessage(order, text);
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: DemoDataStore.instance,
      builder: (context, _) {
        final order = DemoDataStore.instance.orders.firstWhere((o) => o.id == widget.orderId);
        final messages = DemoDataStore.instance.messagesForOrder(widget.orderId);
        final myId = DemoDataStore.instance.currentUser!.id;

        return Scaffold(
          appBar: AppBar(title: const Text('Чат с исполнителем')),
          body: Column(
            children: [
              Expanded(
                child: messages.isEmpty
                    ? const Center(
                        child: Text('Напишите исполнителю', style: TextStyle(color: Colors.black54)),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(14),
                        itemCount: messages.length,
                        itemBuilder: (context, index) {
                          final m = messages[index];
                          final isMe = m.senderId == myId;
                          return Align(
                            alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                            child: Container(
                              margin: const EdgeInsets.symmetric(vertical: 4),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.7),
                              decoration: BoxDecoration(
                                color: isMe ? const Color(0xFF111827) : Colors.white,
                                borderRadius: BorderRadius.circular(14),
                                border: isMe ? null : Border.all(color: const Color(0xFFE5E7EB)),
                              ),
                              child: Text(
                                m.text,
                                style: TextStyle(color: isMe ? Colors.white : Colors.black87),
                              ),
                            ),
                          );
                        },
                      ),
              ),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _controller,
                          decoration: const InputDecoration(hintText: 'Сообщение...'),
                          onSubmitted: (_) => _send(order),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        onPressed: () => _send(order),
                        icon: const Icon(Icons.send),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
