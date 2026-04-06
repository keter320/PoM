# Главный файл сервера PoM

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine
import auth
import chat

from fastapi.staticfiles import StaticFiles
import os

Base.metadata.create_all(bind=engine)

app = FastAPI()

# Раздаём папку с аватарками как статичные файлы
os.makedirs("avatars", exist_ok=True)
app.mount("/avatars", StaticFiles(directory="avatars"), name="avatars")
os.makedirs("chat_images", exist_ok=True)
app.mount("/chat_images", StaticFiles(directory="chat_images"), name="chat_images")
os.makedirs("chat_videos", exist_ok=True)
app.mount("/chat_videos", StaticFiles(directory="chat_videos"), name="chat_videos")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем маршруты
app.include_router(auth.router)
app.include_router(chat.router)

@app.get("/")
def root():
    return {"message": "PoM сервер работает!"}