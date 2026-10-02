// === Внутри io.on('connection', (socket) => { ... }) ===

// 1. Отправка нового сообщения (добавляем генерацию unique ID)
socket.on('private_message', (data) => {
  const msgPayload = {
    id: data.id || (Date.now() + '_' + Math.random().toString(36).substr(2, 9)),
    sender: data.sender || socket.username,
    to: data.to,
    content: data.content,
    type: data.type,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isEdited: false
  };

  // Отправляем отправителю и получателю
  io.emit('receive_message', msgPayload);

  // Пуш-уведомление на заблокированный экран
  const textPreview = data.type === 'image' ? '📷 Фотография' : data.content;
  sendSystemPush(data.to, `@${msgPayload.sender}`, textPreview);
});

// 2. Редактирование сообщения
socket.on('edit_message', (data) => {
  // data: { id, to, sender, newContent }
  io.emit('message_edited', {
    id: data.id,
    to: data.to,
    sender: data.sender,
    newContent: data.newContent
  });
});
