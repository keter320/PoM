# Этот файл отвечает за реалтайм чат
# WebSocket держит постоянное соединение между телефоном и сервером

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from database import Message, User, SessionLocal
from auth import SECRET_KEY, ALGORITHM
import json

router = APIRouter()

# Словарь активных подключений — username: websocket
active_connections: dict = {}

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Функция отправки сообщения конкретному юзеру
async def send_to_user(username: str, message: dict):
    if username in active_connections:
        await active_connections[username].send_text(json.dumps(message))

# WebSocket маршрут — ws://сервер/ws?token=...
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str):
    # Проверяем токен
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
    except JWTError:
        await websocket.close()
        return

    # Принимаем подключение и сохраняем его
    await websocket.accept()
    active_connections[username] = websocket
    print(f"{username} подключился")

    try:
        while True:
            # Ждём сообщение от клиента
            data = await websocket.receive_text()
            message_data = json.loads(data)

            receiver = message_data.get("receiver")
            content = message_data.get("content")

            # Сохраняем сообщение в базу данных
            db = SessionLocal()
            msg = Message(sender=username, receiver=receiver, content=content)
            db.add(msg)
            db.commit()
            db.close()

            # Формируем сообщение для отправки
            packet = {
                "sender": username,
                "receiver": receiver,
                "content": content,
                "type": "message"
            }

            # Отправляем получателю если он онлайн
            await send_to_user(receiver, packet)
            # Отправляем обратно отправителю для подтверждения
            await send_to_user(username, packet)

    except WebSocketDisconnect:
        # Юзер отключился — убираем из активных
        del active_connections[username]
        print(f"{username} отключился")