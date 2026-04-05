# Этот файл отвечает за авторизацию
# Регистрация, вход, проверка токенов

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import jwt
from database import User, SessionLocal

# Секретный ключ для подписи токенов — можешь поменять на любую строку
SECRET_KEY = "pom_secret_key_2024"
ALGORITHM = "HS256"

# Инструмент для шифрования паролей
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Роутер — группа маршрутов для авторизации
router = APIRouter()

# Функция получения сессии базы данных
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Модели данных — что принимаем от пользователя
class RegisterData(BaseModel):
    username: str
    password: str
    display_name: str

class LoginData(BaseModel):
    username: str
    password: str

# Маршрут регистрации — POST /auth/register
@router.post("/auth/register")
def register(data: RegisterData, db: Session = Depends(get_db)):
    # Проверяем что такого юзера ещё нет
    existing = db.query(User).filter(User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Логин уже занят")

    # Шифруем пароль перед сохранением
    hashed_password = pwd_context.hash(data.password)

    # Создаём нового пользователя
    user = User(
        username=data.username,
        password=hashed_password,
        display_name=data.display_name,
        status="user"
    )
    db.add(user)
    db.commit()

    return {"message": "Регистрация успешна"}

# Маршрут входа — POST /auth/login
@router.post("/auth/login")
def login(data: LoginData, db: Session = Depends(get_db)):
    # Ищем юзера в базе
    user = db.query(User).filter(User.username == data.username).first()

    # Проверяем что юзер существует и пароль верный
    if not user or not pwd_context.verify(data.password, user.password):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    # Создаём JWT токен — это как пропуск, телефон будет его отправлять при каждом запросе
    token = jwt.encode({"sub": user.username}, SECRET_KEY, algorithm=ALGORITHM)

    return {
        "token": token,
        "username": user.username,
        "display_name": user.display_name,
        "status": user.status
    }
# Получить профиль пользователя
@router.get("/profile/{username}")
def get_profile(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return {
        "username": user.username,
        "display_name": user.display_name,
        "status": user.status,
        "avatar": user.avatar if hasattr(user, 'avatar') else None
    }

# Обновить имя профиля
@router.post("/profile/update")
def update_profile(data: dict, db: Session = Depends(get_db)):
    username = data.get("username")
    display_name = data.get("display_name")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    user.display_name = display_name
    db.commit()
    return {"message": "Профиль обновлён"}

import os
import shutil
from fastapi import UploadFile, File

# Папка для хранения аватарок
AVATAR_DIR = "avatars"
os.makedirs(AVATAR_DIR, exist_ok=True)

# Загрузка аватарки
@router.post("/profile/avatar/{username}")
async def upload_avatar(username: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    # Сохраняем файл на диск
    ext = file.filename.split(".")[-1]  # расширение файла (jpg, png и тд)
    filename = f"{username}.{ext}"
    filepath = os.path.join(AVATAR_DIR, filename)

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Сохраняем путь в базу
    user.avatar = f"/avatars/{filename}"
    db.commit()

    return {"avatar": user.avatar}

# Получить список всех пользователей (кроме себя)
@router.get("/users/{username}")
def get_users(username: str, db: Session = Depends(get_db)):
    users = db.query(User).filter(User.username != username).all()
    return [
        {
            "username": u.username,
            "display_name": u.display_name,
            "status": u.status,
            "avatar": u.avatar
        }
        for u in users
    ]

from database import Contact

# Получить список контактов пользователя
@router.get("/contacts/{username}")
def get_contacts(username: str, db: Session = Depends(get_db)):
    contacts = db.query(Contact).filter(Contact.owner == username).all()
    result = []
    for c in contacts:
        user = db.query(User).filter(User.username == c.contact).first()
        if user:
            result.append({
                "username": user.username,
                "display_name": user.display_name,
                "status": user.status,
                "avatar": user.avatar
            })
    return result

# Добавить контакт — добавляем обоим сразу
@router.post("/contacts/add")
def add_contact(data: dict, db: Session = Depends(get_db)):
    owner = data.get("owner")
    contact = data.get("contact")

    if owner == contact:
        raise HTTPException(status_code=400, detail="Нельзя добавить себя")

    user = db.query(User).filter(User.username == contact).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    # Добавляем owner -> contact если нет
    existing1 = db.query(Contact).filter(Contact.owner == owner, Contact.contact == contact).first()
    if not existing1:
        db.add(Contact(owner=owner, contact=contact))

    # Добавляем contact -> owner если нет (взаимное добавление)
    existing2 = db.query(Contact).filter(Contact.owner == contact, Contact.contact == owner).first()
    if not existing2:
        db.add(Contact(owner=contact, contact=owner))

    db.commit()
    return {"message": "Контакт добавлен"}