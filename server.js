// Внутри io.on('connection', (socket) => { ... })
socket.on('private_message', (data) => {
  const msgPayload = {
    id: data.id || (Date.now() + '_' + Math.random().toString(36).substr(2, 9)),
    sender: data.sender || socket.username,
    to: data.to,
    content: data.content,
    type: data.type, // 'text' | 'image' | 'audio'
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isEdited: false
  };

  io.emit('receive_message', msgPayload);

  // Формируем текст для системного пуша
  let textPreview = data.content;
  if (data.type === 'image') textPreview = '📷 Фотография';
  if (data.type === 'audio') textPreview = '🎤 Голосовое сообщение';

  sendSystemPush(data.to, `@${msgPayload.sender}`, textPreview);
});
