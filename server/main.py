# Главный файл сервера PoM

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine
import auth
import chat

Base.metadata.create_all(bind=engine)

app = FastAPI()

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