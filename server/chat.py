# Файл чата — WebSocket и история сообщений

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from database import Message, SessionLocal
from auth import SECRET_KEY, ALGORITHM
import json

router = APIRouter()

# Словарь активных подключений
active_connections: dict = {}

async def send_to_user(username: str, message: dict):
    # Проверяем что юзер онлайн перед отправкой
    if username in active_connections:
        try:
            await active_connections[username].send_text(json.dumps(message))
        except Exception:
            # Если не удалось отправить — убираем из активных
            del active_connections[username]

# Новый маршрут — отдаёт историю сообщений между двумя юзерами
@router.get("/messages/{user1}/{user2}")
def get_messages(user1: str, user2: str):
    db = SessionLocal()
    # Берём все сообщения между этими двумя пользователями
    messages = db.query(Message).filter(
        ((Message.sender == user1) & (Message.receiver == user2)) |
        ((Message.sender == user2) & (Message.receiver == user1))
    ).order_by(Message.timestamp).all()
    db.close()

    # Возвращаем список сообщений
    return [
        {
            "sender": m.sender,
            "receiver": m.receiver,
            "content": m.content,
            "timestamp": str(m.timestamp)
        }
        for m in messages
    ]

# WebSocket маршрут
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
    except JWTError:
        await websocket.close()
        return

    await websocket.accept()
    active_connections[username] = websocket
    print(f"{username} подключился")

    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)

            receiver = message_data.get("receiver")
            content = message_data.get("content")

            # Сохраняем в базу
            db = SessionLocal()
            msg = Message(sender=username, receiver=receiver, content=content)
            db.add(msg)
            db.commit()
            db.close()

            packet = {
                "sender": username,
                "receiver": receiver,
                "content": content,
                "type": "message"
            }

            await send_to_user(receiver, packet)
            await send_to_user(username, packet)

    except WebSocketDisconnect:
        if username in active_connections:
            del active_connections[username]
        print(f"{username} отключился")

import os
from fastapi import UploadFile, File
import shutil

# Папка для картинок в чате
IMAGE_DIR = "chat_images"
os.makedirs(IMAGE_DIR, exist_ok=True)

# Загрузка картинки в чат
@router.post("/upload/image")
async def upload_image(file: UploadFile = File(...)):
    ext = file.filename.split(".")[-1]
    filename = f"{os.urandom(8).hex()}.{ext}"  # случайное имя файла
    filepath = os.path.join(IMAGE_DIR, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"url": f"/chat_images/{filename}"}