// Главный файл приложения PoM
// Добавили: сохранение токена, экран чата, WebSocket

import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, FlatList, KeyboardAvoidingView, Platform, Image, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

const SERVER_URL = 'http://192.168.1.156:8000';
const WS_URL = 'ws://192.168.1.156:8000';

export default function App() {
  const [screen, setScreen] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [token, setToken] = useState('');
  const [myUsername, setMyUsername] = useState('');
  const [myDisplayName, setMyDisplayName] = useState('');  // моё имя в чате
  const [newDisplayName, setNewDisplayName] = useState(''); // новое имя (для редактирования)
  const [myAvatar, setMyAvatar] = useState(null); // ссылка на аватарку
  const [chatAvatar, setChatAvatar] = useState(null); // аватарка собеседника

  // Для чата
  const [chatWith, setChatWith] = useState('');        // с кем чатимся
  const [chatInput, setChatInput] = useState('');      // текст в поле ввода
  const [messages, setMessages] = useState([]);        // список сообщений
  const ws = useRef(null);                             // WebSocket соединение
  const flatListRef = useRef(null);                    // ссылка на список сообщений

  // При запуске проверяем есть ли сохранённый токен
  useEffect(() => {
    async function checkToken() {
      const savedToken = await AsyncStorage.getItem('token');
      const savedUsername = await AsyncStorage.getItem('username');
      if (savedToken && savedUsername) {
        setToken(savedToken);
        setMyUsername(savedUsername);
        // Загружаем профиль с сервера — там актуальные данные
        try {
          const response = await fetch(`${SERVER_URL}/profile/${savedUsername}`);
          const data = await response.json();
          setMyDisplayName(data.display_name);
          if (data.avatar) setMyAvatar(`${SERVER_URL}${data.avatar}?t=${Date.now()}`);
        } catch (e) {
          console.log('Ошибка загрузки профиля', e);
        }
        setScreen('chats');
      }
    }
    checkToken();
  }, []);

  // Подключаем WebSocket когда входим в чат
  function connectWebSocket(tok) {
    const socket = new WebSocket(`${WS_URL}/ws?token=${tok}`);

    socket.onopen = () => console.log('WebSocket подключён');

    // Когда приходит новое сообщение — добавляем в список
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      setMessages(prev => [...prev, msg]);
    };

    socket.onerror = (e) => console.log('WebSocket ошибка', e.message);
    socket.onclose = () => console.log('WebSocket закрыт');

    ws.current = socket;
  }

  // Вход
  async function login() {
    try {
      const response = await fetch(`${SERVER_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (response.ok) {
        // Сохраняем токен на телефоне
        await AsyncStorage.setItem('token', data.token);
        await AsyncStorage.setItem('username', data.username);
        setToken(data.token);
        setMyUsername(data.username);
        setMyDisplayName(data.display_name);
        // Загружаем аватарку с сервера
        try {
          const profResponse = await fetch(`${SERVER_URL}/profile/${data.username}`);
          const profData = await profResponse.json();
          if (profData.avatar) setMyAvatar(`${SERVER_URL}${profData.avatar}?t=${Date.now()}`);
        } catch (e) {}
        connectWebSocket(data.token);
        setScreen('chats');
      } else {
        Alert.alert('Ошибка', data.detail);
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    }
  }

  // Регистрация
  async function register() {
    try {
      const response = await fetch(`${SERVER_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, display_name: displayName })
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert('Успех', 'Аккаунт создан! Теперь войди.');
        setScreen('login');
      } else {
        Alert.alert('Ошибка', data.detail);
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
    }
  }

  // Выход
  async function logout() {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('username');
    if (ws.current) ws.current.close();
    setToken('');
    setMyUsername('');
    setScreen('login');
  }

  // Выбор и загрузка аватарки
  async function pickAvatar() {
    // Запрашиваем разрешение на доступ к галерее
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Ошибка', 'Нужно разрешение на доступ к галерее');
      return;
    }

    // Открываем галерею
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,    // можно обрезать
      aspect: [1, 1],         // квадратная обрезка
      quality: 0.7,           // качество (0-1)
    });

    if (result.canceled) return;

    // Отправляем на сервер
    const uri = result.assets[0].uri;
    const formData = new FormData();
    formData.append('file', {
      uri,
      name: 'avatar.jpg',
      type: 'image/jpeg',
    } as any);

    try {
      const response = await fetch(`${SERVER_URL}/profile/avatar/${myUsername}`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        // Добавляем ?t=время чтобы телефон не кешировал старую картинку
        setMyAvatar(`${SERVER_URL}${data.avatar}?t=${Date.now()}`);
        Alert.alert('Готово', 'Аватарка обновлена!');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось загрузить аватарку');
    }
  }

  // Отправка сообщения
  function sendMessage() {
    if (!chatInput.trim() || !chatWith.trim()) return;
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      Alert.alert('Ошибка', 'Нет соединения с сервером');
      return;
    }
    ws.current.send(JSON.stringify({
      receiver: chatWith,
      content: chatInput
    }));
    setChatInput('');
  }

  // Экран входа
  if (screen === 'login') return (
    <View style={styles.container}>
      <Text style={styles.title}>PoM</Text>
      <Text style={styles.subtitle}>Portfolio Messenger</Text>
      <TextInput style={styles.input} placeholder="Логин" placeholderTextColor="#888"
        value={username} onChangeText={setUsername} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Пароль" placeholderTextColor="#888"
        value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={styles.button} onPress={login}>
        <Text style={styles.buttonText}>Войти</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setScreen('register')}>
        <Text style={styles.link}>Нет аккаунта? Зарегистрироваться</Text>
      </TouchableOpacity>
    </View>
  );

  // Экран регистрации
  if (screen === 'register') return (
    <View style={styles.container}>
      <Text style={styles.title}>PoM</Text>
      <Text style={styles.subtitle}>Регистрация</Text>
      <TextInput style={styles.input} placeholder="Логин" placeholderTextColor="#888"
        value={username} onChangeText={setUsername} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Имя в чате" placeholderTextColor="#888"
        value={displayName} onChangeText={setDisplayName} />
      <TextInput style={styles.input} placeholder="Пароль" placeholderTextColor="#888"
        value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={styles.button} onPress={register}>
        <Text style={styles.buttonText}>Создать аккаунт</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setScreen('login')}>
        <Text style={styles.link}>Уже есть аккаунт? Войти</Text>
      </TouchableOpacity>
    </View>
  );

  // Экран чатов
  // Экран чатов
  if (screen === 'chats') return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>PoM</Text>

      {/* Профиль */}
      <View style={styles.profileCard}>
        {myAvatar
          ? <Image source={{ uri: myAvatar }} style={styles.avatar} />
          : <View style={styles.avatar}>
              <Text style={styles.avatarText}>{myDisplayName?.[0]?.toUpperCase() || '?'}</Text>
            </View>
        }
        <View>
          <Text style={styles.profileName}>{myDisplayName}</Text>
          <Text style={styles.profileUsername}>@{myUsername}</Text>
        </View>
        <TouchableOpacity style={styles.editButton} onPress={() => setScreen('profile')}>
          <Text style={styles.editButtonText}>Изменить</Text>
        </TouchableOpacity>
      </View>

      {/* Открыть чат */}
      <TextInput style={styles.input} placeholder="Логин собеседника" placeholderTextColor="#888"
        value={chatWith} onChangeText={setChatWith} autoCapitalize="none" />
      <TouchableOpacity style={styles.button} onPress={async () => {
        if (chatWith.trim()) {
          connectWebSocket(token);
          try {
            const response = await fetch(`${SERVER_URL}/messages/${myUsername}/${chatWith}`);
            const history = await response.json();
            setMessages(history);
          } catch (e) {
            console.log('Ошибка загрузки истории', e);
          }
          setScreen('chat');
          // Загружаем аватарку собеседника
          try {
            const profResponse = await fetch(`${SERVER_URL}/profile/${chatWith}`);
            const profData = await profResponse.json();
            if (profData.avatar) setChatAvatar(`${SERVER_URL}${profData.avatar}?t=${Date.now()}`);
            else setChatAvatar(null);
          } catch (e) {}
        }
      }}>
        <Text style={styles.buttonText}>Открыть чат</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={logout}>
        <Text style={styles.link}>Выйти</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // Экран профиля
  if (screen === 'profile') return (
    <View style={styles.container}>
      <Text style={styles.title}>Профиль</Text>

      {/* Большой аватар */}
      <TouchableOpacity onPress={pickAvatar}>
        {myAvatar
          ? <Image source={{ uri: myAvatar }} style={[styles.avatar, styles.avatarLarge]} />
          : <View style={[styles.avatar, styles.avatarLarge]}>
              <Text style={[styles.avatarText, styles.avatarTextLarge]}>{myDisplayName?.[0]?.toUpperCase() || '?'}</Text>
            </View>
        }
        <Text style={styles.link}>Нажми чтобы сменить фото</Text>
      </TouchableOpacity>

      <Text style={styles.profileUsername}>@{myUsername}</Text>

      <TextInput style={styles.input} placeholder="Новое имя" placeholderTextColor="#888"
        value={newDisplayName} onChangeText={setNewDisplayName} />

      <TouchableOpacity style={styles.button} onPress={async () => {
        if (!newDisplayName.trim()) return;
        try {
          const response = await fetch(`${SERVER_URL}/profile/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: myUsername, display_name: newDisplayName })
          });
          if (response.ok) {
            setMyDisplayName(newDisplayName);
            await AsyncStorage.setItem('display_name', newDisplayName);
            Alert.alert('Готово', 'Имя обновлено!');
            setScreen('chats');
          }
        } catch (e) {
          Alert.alert('Ошибка', 'Не удалось обновить профиль');
        }
      }}>
        <Text style={styles.buttonText}>Сохранить</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setScreen('chats')}>
        <Text style={styles.link}>← Назад</Text>
      </TouchableOpacity>
    </View>
  );

  // Экран чата
  if (screen === 'chat') return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={() => setScreen('chats')}>
          <Text style={styles.link}>← Назад</Text>
        </TouchableOpacity>
        <Text style={styles.chatTitle}>{chatWith}</Text>
      </View>

      {/* Список сообщений */}
      <FlatList
        ref={flatListRef}
        data={messages.filter(m =>
          (m.sender === myUsername && m.receiver === chatWith) ||
          (m.sender === chatWith && m.receiver === myUsername)
        )}
        keyExtractor={(_, i) => i.toString()}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        renderItem={({ item }) => (
          <View style={{ flexDirection: item.sender === myUsername ? 'row-reverse' : 'row', alignItems: 'flex-end', marginBottom: 8, gap: 6 }}>
            {/* Аватарка собеседника рядом с его сообщением */}
            {item.sender !== myUsername && (
              chatAvatar
                ? <Image source={{ uri: chatAvatar }} style={styles.msgAvatar} />
                : <View style={styles.msgAvatarPlaceholder}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{item.sender?.[0]?.toUpperCase()}</Text>
                  </View>
            )}
            <View style={[styles.message, item.sender === myUsername ? styles.myMessage : styles.theirMessage]}>
              <Text style={styles.messageText}>{item.content}</Text>
            </View>
          </View>
        )}
        style={styles.messageList}
      />

      {/* Поле ввода */}
      <View style={styles.inputRow}>
        <TextInput style={styles.chatInput} placeholder="Сообщение..." placeholderTextColor="#888"
          value={chatInput} onChangeText={setChatInput} />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.buttonText}>→</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 48, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#888', marginBottom: 32 },
  input: { width: '100%', backgroundColor: '#1a1a1a', color: '#fff', padding: 14, borderRadius: 12, marginBottom: 12, fontSize: 16 },
  button: { width: '100%', backgroundColor: '#6c63ff', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  link: { color: '#6c63ff', fontSize: 14 },
  chatHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 48, paddingBottom: 16 },
  chatTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  messageList: { flex: 1, width: '100%' },
  message: { padding: 12, borderRadius: 12, marginBottom: 8, maxWidth: '75%' },
  myMessage: { backgroundColor: '#6c63ff', alignSelf: 'flex-end' },
  theirMessage: { backgroundColor: '#1a1a1a', alignSelf: 'flex-start' },
  messageText: { color: '#fff', fontSize: 15 },
  inputRow: { flexDirection: 'row', width: '100%', gap: 8, paddingBottom: 16 },
  chatInput: { flex: 1, backgroundColor: '#1a1a1a', color: '#fff', padding: 14, borderRadius: 12, fontSize: 16 },
  sendButton: { backgroundColor: '#6c63ff', padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, profileCard: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', backgroundColor: '#1a1a1a', padding: 16, borderRadius: 16, marginBottom: 24 },
  profileName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  profileUsername: { color: '#888', fontSize: 13 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#6c63ff', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  avatarLarge: { width: 96, height: 96, borderRadius: 48, marginBottom: 12 },
  avatarTextLarge: { fontSize: 40 },
  editButton: { marginLeft: 'auto', backgroundColor: '#2a2a2a', padding: 8, borderRadius: 8 },
  editButtonText: { color: '#6c63ff', fontSize: 13 }, msgAvatar: { width: 28, height: 28, borderRadius: 14 },
  msgAvatarPlaceholder: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#6c63ff', alignItems: 'center', justifyContent: 'center' },
});