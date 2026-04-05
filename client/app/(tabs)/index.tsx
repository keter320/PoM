// Главный файл приложения PoM

import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, FlatList, KeyboardAvoidingView, Platform, Image } from 'react-native';
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
  const [myDisplayName, setMyDisplayName] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [myAvatar, setMyAvatar] = useState(null);
  const [chatAvatar, setChatAvatar] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState('');

  const [chatWith, setChatWith] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const ws = useRef(null);
  const flatListRef = useRef(null);

  // Загружаем контакты с сервера
  async function loadContacts(forUsername: string) {
    if (!forUsername) return;
    try {
      const response = await fetch(`${SERVER_URL}/contacts/${forUsername}`);
      const data = await response.json();
      setContacts(data);
    } catch (e) {
      console.log('Ошибка загрузки контактов', e);
    }
  }

  // При запуске проверяем сохранённый токен
  useEffect(() => {
    async function checkToken() {
      const savedToken = await AsyncStorage.getItem('token');
      const savedUsername = await AsyncStorage.getItem('username');
      if (savedToken && savedUsername) {
        setToken(savedToken);
        setMyUsername(savedUsername);
        try {
          const response = await fetch(`${SERVER_URL}/profile/${savedUsername}`);
          const data = await response.json();
          setMyDisplayName(data.display_name);
          if (data.avatar) setMyAvatar(`${SERVER_URL}${data.avatar}?t=${Date.now()}`);
        } catch (e) {}
        await loadContacts(savedUsername);
        setScreen('chats');
      }
    }
    checkToken();
  }, []);

  // Подключаем WebSocket
  function connectWebSocket(tok: string, currentUsername: string) {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) return;
    const socket = new WebSocket(`${WS_URL}/ws?token=${tok}`);
    socket.onopen = () => console.log('WebSocket подключён');
    socket.onmessage = async (event) => {
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
        await AsyncStorage.setItem('token', data.token);
        await AsyncStorage.setItem('username', data.username);
        setToken(data.token);
        setMyUsername(data.username);
        setMyDisplayName(data.display_name);
        try {
          const profResponse = await fetch(`${SERVER_URL}/profile/${data.username}`);
          const profData = await profResponse.json();
          if (profData.avatar) setMyAvatar(`${SERVER_URL}${profData.avatar}?t=${Date.now()}`);
        } catch (e) {}
        connectWebSocket(data.token, data.username);
        await loadContacts(data.username);
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
    ws.current = null;
    setToken('');
    setMyUsername('');
    setMyDisplayName('');
    setContacts([]);
    setScreen('login');
  }

  // Выбор аватарки
  async function pickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Ошибка', 'Нужно разрешение на доступ к галерее');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    const formData = new FormData();
    formData.append('file', { uri, name: 'avatar.jpg', type: 'image/jpeg' } as any);
    try {
      const response = await fetch(`${SERVER_URL}/profile/avatar/${myUsername}`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        setMyAvatar(`${SERVER_URL}${data.avatar}?t=${Date.now()}`);
        Alert.alert('Готово', 'Аватарка обновлена!');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось загрузить аватарку');
    }
  }

  // Добавить контакт по логину — сохраняем на сервере
  async function addContact() {
    if (!newContact.trim()) return;
    try {
      const response = await fetch(`${SERVER_URL}/contacts/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: myUsername, contact: newContact.trim() })
      });
      const data = await response.json();
      if (response.ok) {
        await loadContacts(myUsername); // перезагружаем список с сервера
        setNewContact('');
        setAddingContact(false);
      } else {
        Alert.alert('Ошибка', data.detail);
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось найти пользователя');
    }
  }

  // Отправка сообщения
  function sendMessage() {
    if (!chatInput.trim() || !chatWith.trim()) return;
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      Alert.alert('Ошибка', 'Нет соединения с сервером');
      return;
    }
    ws.current.send(JSON.stringify({ receiver: chatWith, content: chatInput }));
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
  if (screen === 'chats') return (
    <View style={styles.container}>
      <Text style={styles.title}>PoM</Text>

      {/* Профиль */}
      <TouchableOpacity style={styles.profileCard} onPress={() => setScreen('profile')}>
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
        <Text style={[styles.link, { marginLeft: 'auto' }]}>✎</Text>
      </TouchableOpacity>

      {/* Список контактов */}
      <FlatList
        data={contacts}
        keyExtractor={(item: any) => item.username}
        style={{ width: '100%' }}
        ListEmptyComponent={
          <Text style={[styles.profileUsername, { textAlign: 'center', marginTop: 32 }]}>
            Добавь первый чат →
          </Text>
        }
        renderItem={({ item }: any) => (
          <TouchableOpacity style={styles.userCard} onPress={async () => {
            setChatWith(item.username);
            connectWebSocket(token, myUsername);
            try {
              const response = await fetch(`${SERVER_URL}/messages/${myUsername}/${item.username}`);
              const history = await response.json();
              setMessages(history);
              if (item.avatar) setChatAvatar(`${SERVER_URL}${item.avatar}?t=${Date.now()}`);
              else setChatAvatar(null);
            } catch (e) {}
            setScreen('chat');
          }}>
            {item.avatar
              ? <Image source={{ uri: `${SERVER_URL}${item.avatar}` }} style={styles.avatar} />
              : <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.display_name?.[0]?.toUpperCase() || '?'}</Text>
                </View>
            }
            <View>
              <Text style={styles.profileName}>{item.display_name}</Text>
              <Text style={styles.profileUsername}>@{item.username}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Поле добавления контакта */}
      {addingContact && (
        <View style={{ width: '100%', flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]}
            placeholder="Логин пользователя" placeholderTextColor="#888"
            value={newContact} onChangeText={setNewContact} autoCapitalize="none"
            autoFocus />
          <TouchableOpacity style={styles.sendButton} onPress={addContact}>
            <Text style={styles.buttonText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.sendButton, { backgroundColor: '#2a2a2a' }]}
            onPress={() => { setAddingContact(false); setNewContact(''); }}>
            <Text style={styles.buttonText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Кнопки внизу */}
      <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginTop: 16 }}>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.link}>Выйти</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setAddingContact(true)}>
          <Text style={styles.link}>+ Новый чат</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Экран профиля
  if (screen === 'profile') return (
    <View style={styles.container}>
      <Text style={styles.title}>Профиль</Text>
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
      <FlatList
        ref={flatListRef}
        data={messages.filter((m: any) =>
          (m.sender === myUsername && m.receiver === chatWith) ||
          (m.sender === chatWith && m.receiver === myUsername)
        )}
        keyExtractor={(_: any, i: number) => i.toString()}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        renderItem={({ item }: any) => (
          <View style={{ flexDirection: item.sender === myUsername ? 'row-reverse' : 'row', alignItems: 'flex-end', marginBottom: 8, gap: 6 }}>
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
  sendButton: { backgroundColor: '#6c63ff', padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', backgroundColor: '#1a1a1a', padding: 16, borderRadius: 16, marginBottom: 24 },
  profileName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  profileUsername: { color: '#888', fontSize: 13 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#6c63ff', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  avatarLarge: { width: 96, height: 96, borderRadius: 48, marginBottom: 12 },
  avatarTextLarge: { fontSize: 40 },
  editButton: { marginLeft: 'auto', backgroundColor: '#2a2a2a', padding: 8, borderRadius: 8 },
  editButtonText: { color: '#6c63ff', fontSize: 13 },
  msgAvatar: { width: 28, height: 28, borderRadius: 14 },
  msgAvatarPlaceholder: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#6c63ff', alignItems: 'center', justifyContent: 'center' },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', backgroundColor: '#1a1a1a', padding: 14, borderRadius: 14, marginBottom: 8 },
});
