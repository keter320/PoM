# Этот файл отвечает за базу данных
# SQLite сохраняет всё в один файл pom.db на диске

from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# Путь к файлу базы данных
DATABASE_URL = "sqlite:///./pom.db"

# Создаём движок базы данных
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# Фабрика сессий — через сессию мы читаем и пишем в базу
SessionLocal = sessionmaker(bind=engine)

# Базовый класс для всех таблиц
Base = declarative_base()

# Таблица пользователей
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)  # логин
    password = Column(String)                            # пароль (зашифрованный)
    display_name = Column(String)                        # имя в чате
    status = Column(String, default="user")             # user / vip / dev

# Таблица сообщений
class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender = Column(String)       # кто отправил
    receiver = Column(String)     # кому отправили
    content = Column(String)      # текст сообщения
    timestamp = Column(DateTime, default=datetime.utcnow)  # время

# Создаём таблицы в базе если их ещё нет
Base.metadata.create_all(bind=engine)