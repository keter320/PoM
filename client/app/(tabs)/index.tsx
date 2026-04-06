// Главный файл приложения PoM

import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, FlatList, KeyboardAvoidingView, Platform, Image, BackHandler, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { useVideoPlayer, VideoView } from 'expo-video';

const SERVER_URL = 'http://192.168.1.156:8000';
const WS_URL = 'ws://192.168.1.156:8000';
const SCREEN_WIDTH = Dimensions.get('window').width;

// Определяем тип медиа
function getMediaType(url: string): 'video' | 'image' {
  const ext = url.split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext) ? 'video' : 'image';
}

// Форматирование времени видео
function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Превью видео в чате — показывает первый кадр + иконку + время
function VideoPreview({ url, onPress }: { url: string, onPress: () => void }) {
  const [duration, setDuration] = useState(0);
  const player = useVideoPlayer(url, p => { p.pause(); });

  useEffect(() => {
    const sub = player.addListener('timeUpdate', (e) => {
      if (e.duration && e.duration > 0) setDuration(e.duration);
    });
    return () => {
      sub.remove();
      try { player.pause(); } catch (e) {}
    };
  }, [player]);

  return (
    <TouchableOpacity onPress={onPress} style={{ width: 200, height: 150, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000' }}>
      <VideoView player={player} style={{ width: 200, height: 150 }} contentFit="cover" nativeControls={false} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }} />
      <View style={{ position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
        <Text style={{ color: '#fff', fontSize: 10 }}>▶</Text>
        <Text style={{ color: '#fff', fontSize: 11 }}>{duration > 0 ? formatTime(duration) : '...'}</Text>
      </View>
    </TouchableOpacity>
  );
}

// Плеер видео на весь экран просмотрщика
function VideoPlayer({ url }: { url: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const player = useVideoPlayer(url, p => { p.loop = false; p.pause(); });

  useEffect(() => {
    const sub1 = player.addListener('playingChange', (e) => {
      setIsPlaying(e.isPlaying);
    });
    const sub2 = player.addListener('timeUpdate', (e) => {
      setPosition(e.currentTime ?? 0);
      if (e.duration && e.duration > 0) setDuration(e.duration);
    });
    // Останавливаем при размонтировании компонента
    return () => {
      sub1.remove();
      sub2.remove();
      try { player.pause(); } catch (e) {}
    };
  }, [player]);

  return (
    <View style={{ width: SCREEN_WIDTH, alignItems: 'center', justifyContent: 'center' }}>
      <VideoView player={player} style={{ width: SCREEN_WIDTH, height: 300 }} contentFit="contain" nativeControls={false} />
      <View style={{ width: '85%', marginTop: 16 }}>
        <TouchableOpacity onPress={() => isPlaying ? player.pause() : player.play()}
          style={{ alignSelf: 'center', width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(108,99,255,0.8)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Text style={{ color: '#fff', fontSize: 24 }}>{isPlaying ? '⏸' : '▶'}</Text>
        </TouchableOpacity>
        <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2 }}>
          <View style={{ height: 4, backgroundColor: '#6c63ff', borderRadius: 2, width: duration > 0 ? `${Math.min((position / duration) * 100, 100)}%` : '0%' }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ color: '#fff', fontSize: 12 }}>{formatTime(position)}</Text>
          <Text style={{ color: '#fff', fontSize: 12 }}>{duration > 0 ? formatTime(duration) : '--:--'}</Text>
        </View>
      </View>
    </View>
  );
}

// Просмотрщик фото с зумом
function ImageViewer({ url }: { url: string }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const [detailMode, setDetailMode] = useState(false);

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(150)
    .onEnd(() => {
      if (!detailMode) {
        runOnJS(setDetailMode)(true);
        scale.value = withSpring(2);
        savedScale.value = 2;
      } else {
        runOnJS(setDetailMode)(false);
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedX.value = 0;
        savedY.value = 0;
      }
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => { scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5)); })
    .onEnd(() => { savedScale.value = scale.value; });

  const panDetailGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = savedX.value + e.translationX;
      translateY.value = savedY.value + e.translationY;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const panListGesture = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .failOffsetY([-20, 20])
    .onUpdate(() => {}).onEnd(() => {});

  const detailComposed = Gesture.Simultaneous(pinchGesture, panDetailGesture, doubleTapGesture);
  const listComposed = Gesture.Simultaneous(panListGesture, doubleTapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateX: translateX.value }, { translateY: translateY.value }]
  }));

  return (
    <GestureDetector gesture={detailMode ? detailComposed : listComposed}>
      <Animated.View style={[{ width: SCREEN_WIDTH, height: 600, alignItems: 'center', justifyContent: 'center' }, animatedStyle]}>
        <Image source={{ uri: url }} style={{ width: SCREEN_WIDTH, height: 400 }} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

// Один слайд в просмотрщике — фото или видео
function MediaSlide({ url }: { url: string }) {
  const isVideo = getMediaType(url) === 'video';
  return (
    <View style={{ width: SCREEN_WIDTH, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      {isVideo ? <VideoPlayer url={url} /> : <ImageViewer url={url} />}
    </View>
  );
}

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
  const [viewingMedia, setViewingMedia] = useState(null);
  const [viewingIndex, setViewingIndex] = useState(0);
  const [allChatMedia, setAllChatMedia] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState('');
  const [chatWith, setChatWith] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const ws = useRef(null);
  const flatListRef = useRef(null);

  async function loadContacts(forUsername: string) {
    if (!forUsername) return;
    try {
      const response = await fetch(`${SERVER_URL}/contacts/${forUsername}`);
      const data = await response.json();
      setContacts(data);
    } catch (e) {}
  }

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

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (viewingMedia) { setViewingMedia(null); return true; }
      if (screen === 'chat') { setScreen('chats'); return true; }
      if (screen === 'profile') { setScreen('chats'); return true; }
      return false;
    });
    return () => handler.remove();
  }, [viewingMedia, screen]);

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

  async function pickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Ошибка', 'Нужно разрешение'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    const formData = new FormData();
    formData.append('file', { uri, name: 'avatar.jpg', type: 'image/jpeg' } as any);
    try {
      const response = await fetch(`${SERVER_URL}/profile/avatar/${myUsername}`, { method: 'POST', body: formData });
      const data = await response.json();
      if (response.ok) {
        setMyAvatar(`${SERVER_URL}${data.avatar}?t=${Date.now()}`);
        Alert.alert('Готово', 'Аватарка обновлена!');
      }
    } catch (e) {}
  }

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
        await loadContacts(myUsername);
        setNewContact('');
        setAddingContact(false);
      } else {
        Alert.alert('Ошибка', data.detail);
      }
    } catch (e) {}
  }

  function sendMessage() {
    if (!chatInput.trim() || !chatWith.trim()) return;
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      Alert.alert('Ошибка', 'Нет соединения');
      return;
    }
    ws.current.send(JSON.stringify({ receiver: chatWith, content: chatInput }));
    setChatInput('');
  }

  // Отправка медиа — фото и видео одной кнопкой
  async function sendMedia(type: 'images' | 'videos') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Ошибка', 'Нужно разрешение'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'videos' ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled) return;

    const urls: string[] = [];
    for (const asset of result.assets) {
      const isVideo = asset.type === 'video';
      const ext = asset.uri.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
      const name = isVideo ? `video.${ext}` : `image.${ext}`;
      const type = isVideo ? `video/${ext}` : `image/${ext}`;
      const endpoint = isVideo ? '/upload/video' : '/upload/image';
      const formData = new FormData();
      formData.append('file', { uri: asset.uri, name, type } as any);
      try {
        const response = await fetch(`${SERVER_URL}${endpoint}`, { method: 'POST', body: formData });
        const data = await response.json();
        if (response.ok) urls.push(`${SERVER_URL}${data.url}`);
      } catch (e) {}
    }

    if (urls.length > 0) {
      ws.current.send(JSON.stringify({
        receiver: chatWith,
        content: `[media]${urls.join('|')}`
      }));
    }
  }

  // Открыть просмотрщик медиа
  function openMediaViewer(url: string, msgs: any[]) {
    const allMedia = msgs
      .filter((m: any) =>
        m.content?.startsWith('[media]') ||
        m.content?.startsWith('[images]') ||
        m.content?.startsWith('[image]') ||
        m.content?.startsWith('[videos]')
      )
      .flatMap((m: any) => {
        if (m.content.startsWith('[media]')) return m.content.replace('[media]', '').split('|');
        if (m.content.startsWith('[images]')) return m.content.replace('[images]', '').split('|');
        if (m.content.startsWith('[videos]')) return m.content.replace('[videos]', '').split('|');
        return [m.content.replace('[image]', '')];
      });
    setAllChatMedia(allMedia);
    setViewingIndex(Math.max(0, allMedia.indexOf(url)));
    setViewingMedia(url);
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

  if (screen === 'chats') return (
    <View style={styles.container}>
      <Text style={styles.title}>PoM</Text>
      <TouchableOpacity style={styles.profileCard} onPress={() => setScreen('profile')}>
        {myAvatar
          ? <Image source={{ uri: myAvatar }} style={styles.avatar} />
          : <View style={styles.avatar}><Text style={styles.avatarText}>{myDisplayName?.[0]?.toUpperCase() || '?'}</Text></View>
        }
        <View>
          <Text style={styles.profileName}>{myDisplayName}</Text>
          <Text style={styles.profileUsername}>@{myUsername}</Text>
        </View>
        <Text style={[styles.link, { marginLeft: 'auto' }]}>✎</Text>
      </TouchableOpacity>

      <FlatList
        data={contacts}
        keyExtractor={(item: any) => item.username}
        style={{ width: '100%' }}
        ListEmptyComponent={
          <Text style={[styles.profileUsername, { textAlign: 'center', marginTop: 32 }]}>Добавь первый чат →</Text>
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
              : <View style={styles.avatar}><Text style={styles.avatarText}>{item.display_name?.[0]?.toUpperCase() || '?'}</Text></View>
            }
            <View>
              <Text style={styles.profileName}>{item.display_name}</Text>
              <Text style={styles.profileUsername}>@{item.username}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {addingContact && (
        <View style={{ width: '100%', flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]}
            placeholder="Логин пользователя" placeholderTextColor="#888"
            value={newContact} onChangeText={setNewContact} autoCapitalize="none" autoFocus />
          <TouchableOpacity style={styles.sendButton} onPress={addContact}>
            <Text style={styles.buttonText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.sendButton, { backgroundColor: '#2a2a2a' }]}
            onPress={() => { setAddingContact(false); setNewContact(''); }}>
            <Text style={styles.buttonText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginTop: 16 }}>
        <TouchableOpacity onPress={logout}><Text style={styles.link}>Выйти</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setAddingContact(true)}><Text style={styles.link}>+ Новый чат</Text></TouchableOpacity>
      </View>
    </View>
  );

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
        } catch (e) {}
      }}>
        <Text style={styles.buttonText}>Сохранить</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setScreen('chats')}>
        <Text style={styles.link}>← Назад</Text>
      </TouchableOpacity>
    </View>
  );

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
              {/* Новый формат [media] */}
              {item.content?.startsWith('[media]') ? (
                (() => {
                  const urls = item.content.replace('[media]', '').split('|');
                  return (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, maxWidth: 220 }}>
                      {urls.map((url: string, i: number) => (
                        getMediaType(url) === 'video'
                          ? <VideoPreview key={i} url={url} onPress={() => openMediaViewer(url, messages)} />
                          : <TouchableOpacity key={i} onPress={() => openMediaViewer(url, messages)}>
                              <Image source={{ uri: url }}
                                style={{ width: urls.length === 1 ? 200 : 106, height: urls.length === 1 ? 150 : 106, borderRadius: 8 }}
                                resizeMode="cover" />
                            </TouchableOpacity>
                      ))}
                    </View>
                  );
                })()
              ) : item.content?.startsWith('[images]') ? (
                // Старый формат для совместимости
                (() => {
                  const urls = item.content.replace('[images]', '').split('|');
                  return (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, maxWidth: 220 }}>
                      {urls.map((url: string, i: number) => (
                        <TouchableOpacity key={i} onPress={() => openMediaViewer(url, messages)}>
                          <Image source={{ uri: url }}
                            style={{ width: urls.length === 1 ? 200 : 106, height: urls.length === 1 ? 150 : 106, borderRadius: 8 }}
                            resizeMode="cover" />
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })()
              ) : item.content?.startsWith('[videos]') ? (
                (() => {
                  const urls = item.content.replace('[videos]', '').split('|');
                  return (
                    <View style={{ gap: 4 }}>
                      {urls.map((url: string, i: number) => (
                        <VideoPreview key={i} url={url} onPress={() => openMediaViewer(url, messages)} />
                      ))}
                    </View>
                  );
                })()
              ) : item.content?.startsWith('[image]') ? (
                <TouchableOpacity onPress={() => openMediaViewer(item.content.replace('[image]', ''), messages)}>
                  <Image source={{ uri: item.content.replace('[image]', '') }}
                    style={{ width: 200, height: 150, borderRadius: 8 }} resizeMode="cover" />
                </TouchableOpacity>
              ) : (
                <Text style={styles.messageText}>{item.content}</Text>
              )}
            </View>
          </View>
        )}
        style={styles.messageList}
      />

      <View style={styles.inputRow}>
        <TouchableOpacity style={[styles.sendButton, { backgroundColor: '#2a2a2a' }]} onPress={() => sendMedia('images')}>
          <Text style={styles.buttonText}>🖼</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.sendButton, { backgroundColor: '#2a2a2a' }]} onPress={() => sendMedia('videos')}>
          <Text style={styles.buttonText}>🎥</Text>
        </TouchableOpacity>
        <TextInput style={styles.chatInput} placeholder="Сообщение..." placeholderTextColor="#888"
          value={chatInput} onChangeText={setChatInput} />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.buttonText}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Просмотрщик медиа */}
      {viewingMedia && (
        <View style={styles.mediaViewer}>
          <FlatList
            data={allChatMedia}
            horizontal
            pagingEnabled
            initialScrollIndex={viewingIndex}
            getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
            keyExtractor={(_, i) => i.toString()}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setViewingIndex(index);
              setViewingMedia(allChatMedia[index]);
            }}
            renderItem={({ item: mediaUrl }: any) => (
              <MediaSlide url={mediaUrl} />
            )}
            style={{ flex: 1, width: SCREEN_WIDTH }}
          />
          <View style={styles.imageCounter}>
            <Text style={{ color: '#fff', fontSize: 14 }}>{viewingIndex + 1} / {allChatMedia.length}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={() => { setViewingMedia(null); setAllChatMedia([]); }}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
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
  mediaViewer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  imageCounter: { position: 'absolute', bottom: 48, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  closeButton: { position: 'absolute', top: 48, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { color: '#fff', fontSize: 16 },
});
