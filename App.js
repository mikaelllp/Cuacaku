// CuacaKu — Weather Journal
// Konsep: bandingkan 2 kota + catat mood harian berdasarkan cuaca
// Stack  : React Native (Expo) · Open-Meteo API · AsyncStorage · Animated API
// Level  : Core + Level 2 (angin, siang/malam, min-maks, riwayat, refresh,
//           background dinamis) + Level 3 (multi-kota, favorit, pull-refresh,
//           animasi fade-in) + BONUS: mood journal & compare mode & hapus kota

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, TextInput, ScrollView, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet, Animated, RefreshControl,
  StatusBar, SafeAreaView, Platform, Alert, Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ═══════════════════════════════════════════════════════════════════════
//  KONSTANTA & MAPPING DATA
// ═══════════════════════════════════════════════════════════════════════

// WMO weathercode → label, emoji, warna latar, aksen
const WMO = {
  0:  { label: 'Cerah',            emoji: d => d ? '☀️' : '🌙',  bg: '#1A2E52', accent: '#FFD166' },
  1:  { label: 'Cerah Berawan',    emoji: d => d ? '🌤️' : '🌙', bg: '#1E3460', accent: '#F4A261' },
  2:  { label: 'Berawan Sebagian', emoji: ()=> '⛅',              bg: '#2D3E50', accent: '#A8DADC' },
  3:  { label: 'Mendung',          emoji: ()=> '☁️',              bg: '#1F2937', accent: '#94A3B8' },
  45: { label: 'Berkabut',         emoji: ()=> '🌫️',             bg: '#374151', accent: '#D1D5DB' },
  48: { label: 'Kabut Beku',       emoji: ()=> '🌫️',             bg: '#374151', accent: '#E2E8F0' },
  51: { label: 'Gerimis Ringan',   emoji: ()=> '🌦️',             bg: '#1E3A4F', accent: '#7DD3FC' },
  53: { label: 'Gerimis Sedang',   emoji: ()=> '🌦️',             bg: '#172D3E', accent: '#60C3FA' },
  55: { label: 'Gerimis Lebat',    emoji: ()=> '🌧️',             bg: '#112030', accent: '#38BDF8' },
  61: { label: 'Hujan Ringan',     emoji: ()=> '🌧️',             bg: '#1E2E45', accent: '#93C5FD' },
  63: { label: 'Hujan Sedang',     emoji: ()=> '🌧️',             bg: '#172438', accent: '#60A5FA' },
  65: { label: 'Hujan Lebat',      emoji: ()=> '🌧️',             bg: '#101A2D', accent: '#3B82F6' },
  71: { label: 'Salju Ringan',     emoji: ()=> '🌨️',             bg: '#364B6E', accent: '#E2E8F0' },
  73: { label: 'Salju Sedang',     emoji: ()=> '❄️',              bg: '#4A5E80', accent: '#F8FAFC' },
  75: { label: 'Salju Lebat',      emoji: ()=> '❄️',              bg: '#5B7099', accent: '#FFFFFF' },
  80: { label: 'Hujan Lokal',      emoji: ()=> '🌦️',             bg: '#1A2E45', accent: '#7DD3FC' },
  81: { label: 'Hujan Lokal Sedang',emoji:()=> '🌦️',             bg: '#132238', accent: '#60A5FA' },
  82: { label: 'Hujan Lokal Lebat',emoji: ()=> '⛈️',             bg: '#0D1825', accent: '#3B82F6' },
  95: { label: 'Badai Petir',      emoji: ()=> '⛈️',             bg: '#0F1523', accent: '#FDE047' },
  96: { label: 'Badai + Hujan Es', emoji: ()=> '⛈️',             bg: '#0A1018', accent: '#FACC15' },
  99: { label: 'Badai Besar',      emoji: ()=> '🌩️',             bg: '#050A0F', accent: '#F59E0B' },
};
const DEFAULT_BG = '#0F1B30';
const getWMO = code => WMO[code] ?? { label: '?', emoji: ()=> '❓', bg: DEFAULT_BG, accent: '#94A3B8' };

const DIRS = ['U','TL','T','TG','S','BD','B','BL'];
const ARROW = ['↑','↗','→','↘','↓','↙','←','↖'];
const deg2dir   = d => DIRS [Math.round(d / 45) % 8];
const deg2arrow = d => ARROW[Math.round(d / 45) % 8];

// Suasana hati yang bisa dipilih saat journaling
const MOODS = [
  { key: 'happy',    label: 'Senang',   icon: '😊' },
  { key: 'calm',     label: 'Tenang',   icon: '😌' },
  { key: 'gloomy',   label: 'Murung',   icon: '😔' },
  { key: 'excited',  label: 'Semangat', icon: '🤩' },
  { key: 'tired',    label: 'Lelah',    icon: '😴' },
  { key: 'anxious',  label: 'Cemas',    icon: '😰' },
];

// Storage keys
const KEY_FAV     = 'ck_fav_v1';
const KEY_HIST    = 'ck_hist_v1';
const KEY_JOURNAL = 'ck_journal_v1';

const MAX_HIST = 6;
const MAX_CMP  = 2;   // maksimal kota untuk compare

// ═══════════════════════════════════════════════════════════════════════
//  API HELPER
// ═══════════════════════════════════════════════════════════════════════

async function fetchCity(name, signal) {
  // Langkah 1 – Geocoding: nama kota → koordinat
  const geoRes  = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=id`,
    { signal }
  );
  const geoJson = await geoRes.json();
  if (!geoJson.results?.length) throw new Error(`"${name}" tidak ditemukan`);
  const loc = geoJson.results[0];

  // Langkah 2 – Forecast: koordinat → cuaca (current + daily min/maks)
  const fRes  = await fetch(
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${loc.latitude}&longitude=${loc.longitude}` +
    `&current_weather=true` +
    `&daily=temperature_2m_max,temperature_2m_min,weathercode` +
    `&timezone=auto`,
    { signal }
  );
  const fJson = await fRes.json();
  const cw = fJson.current_weather;

  return {
    kota:      loc.name,
    negara:    loc.country,
    suhu:      cw.temperature,
    angin:     cw.windspeed,
    arahAngin: cw.winddirection,
    kode:      cw.weathercode,
    isDay:     cw.is_day,
    suhuMax:   fJson.daily?.temperature_2m_max?.[0] ?? null,
    suhuMin:   fJson.daily?.temperature_2m_min?.[0] ?? null,
    // Prakiraan 3 hari berikutnya untuk mini forecast
    forecast3: fJson.daily ? [1,2,3].map(i => ({
      suhuMax: fJson.daily.temperature_2m_max?.[i] ?? null,
      suhuMin: fJson.daily.temperature_2m_min?.[i] ?? null,
      kode:    fJson.daily.weathercode?.[i] ?? 0,
    })) : [],
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  KOMPONEN: WeatherCard (tampilan lengkap satu kota)
// ═══════════════════════════════════════════════════════════════════════
function WeatherCard({ data, isFav, onFav, onJournal, onRemove, compact = false }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(24);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.kota]);

  const info  = getWMO(data.kode);
  const isDay = data.isDay === 1;

  return (
    <Animated.View style={[
      styles.card,
      { backgroundColor: info.bg, opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      compact && styles.cardCompact,
    ]}>
      {/* Top row: badge siang/malam + tombol fav + tombol hapus */}
      <View style={styles.cardTopRow}>
        <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
          <Text style={styles.badgeText}>{isDay ? `☀️ Siang` : `🌙 Malam`}</Text>
        </View>
        <View style={styles.cardTopActions}>
          <TouchableOpacity
            onPress={() => onFav(data.kota)}
            style={[styles.iconBtn, isFav && { backgroundColor: 'rgba(255,213,102,0.18)' }]}
          >
            <Text style={{ fontSize: 18, color: isFav ? '#FFD166' : 'rgba(255,255,255,0.35)' }}>
              {isFav ? '★' : '☆'}
            </Text>
          </TouchableOpacity>
          {onRemove && (
            <TouchableOpacity
              onPress={() => onRemove(data.kota)}
              style={[styles.iconBtn, { backgroundColor: 'rgba(255,82,82,0.12)' }]}
            >
              <Text style={{ fontSize: 16, color: 'rgba(255,120,120,0.85)', fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Nama kota */}
      <Text style={styles.cardCity} numberOfLines={1}>{data.kota}</Text>
      <Text style={styles.cardCountry}>{data.negara}</Text>

      {/* Emoji besar + suhu */}
      <Text style={[styles.cardEmoji, compact && { fontSize: 44 }]}>{info.emoji(isDay)}</Text>
      <View style={styles.tempRow}>
        <Text style={[styles.tempBig, { color: info.accent }, compact && { fontSize: 52 }]}>
          {data.suhu}
        </Text>
        <Text style={[styles.tempUnit, { color: info.accent }]}>°C</Text>
      </View>
      <Text style={styles.cardLabel}>{info.label}</Text>

      {/* Min / Maks */}
      {data.suhuMin !== null && (
        <View style={styles.minMaxRow}>
          <Text style={styles.minMaxText}>❄️ {data.suhuMin}°</Text>
          <Text style={styles.minMaxSep}>—</Text>
          <Text style={styles.minMaxText}>🔥 {data.suhuMax}°</Text>
        </View>
      )}

      <View style={styles.divider} />

      {/* Angin */}
      <View style={styles.windRow}>
        <Text style={styles.windArrow}>{deg2arrow(data.arahAngin)}</Text>
        <View>
          <Text style={styles.windSpeed}>💨 {data.angin} km/j</Text>
          <Text style={styles.windDir}>{deg2dir(data.arahAngin)} · {data.arahAngin}°</Text>
        </View>
      </View>

      {/* Mini forecast 3 hari (hanya di non-compact) */}
      {!compact && data.forecast3?.length > 0 && (
        <>
          <View style={styles.divider} />
          <Text style={styles.forecastLabel}>3 Hari ke Depan</Text>
          <View style={styles.forecastRow}>
            {data.forecast3.map((d, i) => {
              const fi = getWMO(d.kode);
              return (
                <View key={i} style={styles.forecastCell}>
                  <Text style={styles.forecastDay}>+{i+1}h</Text>
                  <Text style={{ fontSize: 20 }}>{fi.emoji(true)}</Text>
                  <Text style={[styles.forecastMax, { color: fi.accent }]}>{d.suhuMax}°</Text>
                  <Text style={styles.forecastMin}>{d.suhuMin}°</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Tombol tulis jurnal */}
      {onJournal && (
        <TouchableOpacity style={[styles.journalBtn, { borderColor: info.accent }]} onPress={onJournal}>
          <Text style={[styles.journalBtnText, { color: info.accent }]}>✏️  Catat Mood Hari Ini</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  KOMPONEN: MoodModal (journaling berdasarkan cuaca)
// ═══════════════════════════════════════════════════════════════════════
function MoodModal({ visible, cuaca, onClose, onSave }) {
  const [mood,  setMood]  = useState(null);
  const [notes, setNotes] = useState('');
  if (!cuaca) return null;
  const info  = getWMO(cuaca.kode);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalBox, { backgroundColor: info.bg }]}>
          <Text style={styles.modalTitle}>Mood di {cuaca.kota}</Text>
          <Text style={styles.modalSub}>
            {info.emoji(cuaca.isDay === 1)}  {info.label} · {cuaca.suhu}°C
          </Text>

          <Text style={styles.modalSection}>Bagaimana perasaanmu?</Text>
          <View style={styles.moodGrid}>
            {MOODS.map(m => (
              <TouchableOpacity
                key={m.key}
                style={[styles.moodChip, mood === m.key && { backgroundColor: info.accent + '44', borderColor: info.accent }]}
                onPress={() => setMood(m.key)}
              >
                <Text style={styles.moodIcon}>{m.icon}</Text>
                <Text style={[styles.moodLabel, mood === m.key && { color: info.accent }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.modalSection}>Catatan (opsional)</Text>
          <TextInput
            style={[styles.notesInput, { borderColor: info.accent + '66' }]}
            placeholder="Ceritakan harimu..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: info.accent }, !mood && styles.saveBtnDisabled]}
              onPress={() => { if (mood) { onSave({ mood, notes }); setMood(null); setNotes(''); } }}
              disabled={!mood}
            >
              <Text style={styles.saveBtnText}>Simpan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  KOMPONEN: JournalEntry (satu baris di tab jurnal)
// ═══════════════════════════════════════════════════════════════════════
function JournalEntry({ entry }) {
  const info  = getWMO(entry.kode);
  const mood  = MOODS.find(m => m.key === entry.mood);
  const date  = new Date(entry.timestamp);
  const label = date.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });

  return (
    <View style={[styles.journalCard, { borderLeftColor: info.accent }]}>
      <View style={styles.journalCardHeader}>
        <Text style={styles.journalMood}>{mood?.icon} {mood?.label}</Text>
        <Text style={styles.journalDate}>{label}</Text>
      </View>
      <Text style={styles.journalCity}>{entry.kota}</Text>
      <Text style={styles.journalWeather}>
        {info.emoji(true)} {info.label} · {entry.suhu}°C
      </Text>
      {entry.notes ? <Text style={styles.journalNotes}>{entry.notes}</Text> : null}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  KOMPONEN: ComparePanel (bandingkan 2 kota)
// ═══════════════════════════════════════════════════════════════════════
function ComparePanel({ cities }) {
  if (cities.length < 2) return (
    <View style={styles.compareEmpty}>
      <Text style={styles.compareEmptyIcon}>⚖️</Text>
      <Text style={styles.compareEmptyText}>
        Tambahkan minimal 2 kota di tab Cari untuk membandingkan cuaca mereka.
      </Text>
    </View>
  );
  const [a, b] = cities;
  const infoA = getWMO(a.kode);
  const infoB = getWMO(b.kode);

  const rows = [
    { label: 'Suhu',   valA: `${a.suhu}°C`,   valB: `${b.suhu}°C`,   winner: a.suhu > b.suhu ? 'A' : 'B' },
    { label: 'Maks',   valA: `${a.suhuMax}°`,  valB: `${b.suhuMax}°`, winner: a.suhuMax > b.suhuMax ? 'A' : 'B' },
    { label: 'Min',    valA: `${a.suhuMin}°`,  valB: `${b.suhuMin}°`, winner: a.suhuMin > b.suhuMin ? 'A' : 'B' },
    { label: 'Angin',  valA: `${a.angin} km`, valB: `${b.angin} km`, winner: a.angin < b.angin ? 'A' : 'B' },
  ];

  return (
    <ScrollView contentContainerStyle={styles.comparePad} showsVerticalScrollIndicator={false}>
      {/* Header dua kota */}
      <View style={styles.compareHeader}>
        <View style={[styles.compareCity, { backgroundColor: infoA.bg }]}>
          <Text style={styles.compareCityEmoji}>{infoA.emoji(a.isDay === 1)}</Text>
          <Text style={styles.compareCityName} numberOfLines={1}>{a.kota}</Text>
          <Text style={[styles.compareSuhu, { color: infoA.accent }]}>{a.suhu}°C</Text>
        </View>
        <Text style={styles.compareVS}>VS</Text>
        <View style={[styles.compareCity, { backgroundColor: infoB.bg }]}>
          <Text style={styles.compareCityEmoji}>{infoB.emoji(b.isDay === 1)}</Text>
          <Text style={styles.compareCityName} numberOfLines={1}>{b.kota}</Text>
          <Text style={[styles.compareSuhu, { color: infoB.accent }]}>{b.suhu}°C</Text>
        </View>
      </View>

      {/* Tabel perbandingan */}
      {rows.map(r => (
        <View key={r.label} style={styles.compareRow}>
          <Text style={[styles.compareVal, r.winner === 'A' && styles.compareWinner]}>{r.valA}</Text>
          <Text style={styles.compareRowLabel}>{r.label}</Text>
          <Text style={[styles.compareVal, r.winner === 'B' && styles.compareWinner]}>{r.valB}</Text>
        </View>
      ))}

      <Text style={styles.compareNote}>
        Cuaca kota pertama dan kedua yang kamu cari akan otomatis masuk ke sini.
      </Text>
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  APP UTAMA
// ═══════════════════════════════════════════════════════════════════════
export default function App() {
  // ─── State utama ───────────────────────────────────────────────────
  const [tab,        setTab]       = useState('search');   // 'search'|'journal'|'compare'|'fav'
  const [query,      setQuery]     = useState('');
  const [cities,     setCities]    = useState([]);         // array data cuaca
  const [loading,    setLoading]   = useState(false);
  const [error,      setError]     = useState(null);
  const [refreshing, setRefreshing]= useState(false);

  const [history,    setHistory]   = useState([]);
  const [favorites,  setFavorites] = useState([]);
  const [journal,    setJournal]   = useState([]);         // entri jurnal mood

  const [journalTarget, setJournalTarget] = useState(null); // kota yang sedang di-journal
  const [showJournal,   setShowJournal]   = useState(false);

  // ─── Load AsyncStorage sekali saat mount ──────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [fRaw, hRaw, jRaw] = await Promise.all([
          AsyncStorage.getItem(KEY_FAV),
          AsyncStorage.getItem(KEY_HIST),
          AsyncStorage.getItem(KEY_JOURNAL),
        ]);
        if (fRaw) setFavorites(JSON.parse(fRaw));
        if (hRaw) setHistory(JSON.parse(hRaw));
        if (jRaw) setJournal(JSON.parse(jRaw));
      } catch (_) {
        // ignore error saat load data lokal
      }
    })();
  }, []);

  // ─── Warna background dinamis (ikut cuaca kota pertama) ───────────
  const bgColor = useMemo(() => (
    cities.length > 0 ? getWMO(cities[0].kode).bg : DEFAULT_BG
  ), [cities]);

  // ─── Helper simpan history ────────────────────────────────────────
  const pushHistory = useCallback((name) => {
    setHistory(prev => {
      const upd = [name, ...prev.filter(k => k.toLowerCase() !== name.toLowerCase())].slice(0, MAX_HIST);
      AsyncStorage.setItem(KEY_HIST, JSON.stringify(upd)).catch(() => {});
      return upd;
    });
  }, []);

  // ─── Debounce + fetch cuaca (1 kota langsung dari query) ──────────
  useEffect(() => {
    if (!query.trim()) { setError(null); setLoading(false); return; }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    const t = setTimeout(async () => {
      try {
        const result = await fetchCity(query.trim(), ctrl.signal);
        setCities(prev => {
          const filtered = prev.filter(c => c.kota.toLowerCase() !== result.kota.toLowerCase());
          return [result, ...filtered].slice(0, MAX_CMP);
        });
        pushHistory(result.kota);
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message);
      } finally { setLoading(false); }
    }, 500); // debounce 500ms

    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, pushHistory]);

  // ─── Refresh semua kota ───────────────────────────────────────────
  const doRefresh = useCallback(async (isPull = false) => {
    if (!cities.length) { setRefreshing(false); return; }
    if (isPull) setRefreshing(true); else setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    try {
      const res = await Promise.all(cities.map(c => fetchCity(c.kota, ctrl.signal)));
      setCities(res);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally { setRefreshing(false); setLoading(false); }
  }, [cities]);

  // ─── Toggle favorit ───────────────────────────────────────────────
  const toggleFav = useCallback((name) => {
    setFavorites(prev => {
      const upd = prev.includes(name) ? prev.filter(k => k !== name) : [...prev, name];
      AsyncStorage.setItem(KEY_FAV, JSON.stringify(upd)).catch(() => {});
      return upd;
    });
  }, []);

  // ─── Hapus kota dari daftar cuaca yang sedang dicari ──────────────
  const removeCity = useCallback((name) => {
    setCities(prev => prev.filter(c => c.kota !== name));
  }, []);

  // ─── Simpan entri jurnal ──────────────────────────────────────────
  const saveJournal = useCallback(({ mood, notes }) => {
    if (!journalTarget) return;
    const entry = {
      id:        Date.now().toString(),
      timestamp: Date.now(),
      kota:      journalTarget.kota,
      suhu:      journalTarget.suhu,
      kode:      journalTarget.kode,
      isDay:     journalTarget.isDay,
      mood,
      notes,
    };
    setJournal(prev => {
      const upd = [entry, ...prev];
      AsyncStorage.setItem(KEY_JOURNAL, JSON.stringify(upd)).catch(() => {});
      return upd;
    });
    setShowJournal(false);
    setJournalTarget(null);
    Alert.alert('✅ Tersimpan!', `Mood "${MOODS.find(m=>m.key===mood)?.label}" di ${entry.kota} dicatat.`);
  }, [journalTarget]);

  // ─── Hapus semua jurnal ───────────────────────────────────────────
  const clearJournal = () => {
    Alert.alert('Hapus Jurnal?', 'Semua catatan mood akan dihapus permanen.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: async () => {
          setJournal([]);
          await AsyncStorage.removeItem(KEY_JOURNAL).catch(() => {});
      }},
    ]);
  };

  // ═══════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bgColor }]}>
      <StatusBar barStyle="light-content" backgroundColor={bgColor} />

      {/* ── Tab Bar ─────────────────────────────────────────────── */}
      <View style={[styles.tabBar, { backgroundColor: bgColor }]}>
        {[
          { key: 'search',  label: '🔍 Cari'    },
          { key: 'compare', label: '⚖️ Banding' },
          { key: 'journal', label: '📓 Jurnal'  },
          { key: 'fav',     label: '★ Fav'     },
        ].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabBtnText, tab === t.key && styles.tabBtnTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ══════════════ TAB SEARCH ═══════════════════════════════ */}
      {tab === 'search' && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.pad}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => doRefresh(true)}
              tintColor="rgba(255,255,255,0.6)"
            />
          }
        >
          {/* Judul */}
          <View style={styles.appHeader}>
            <Text style={styles.appTitle}>CuacaKu</Text>
            <Text style={styles.appSub}>Weather · Journal · Compare</Text>
          </View>

          {/* Search bar */}
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Cari kota..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                autoCapitalize="words"
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                  <Text style={styles.clearIcon}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            {cities.length > 0 && !loading && (
              <TouchableOpacity style={styles.refreshBtn} onPress={() => doRefresh(false)}>
                <Text style={styles.refreshIcon}>↺</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Info maks kota */}
          {cities.length > 0 && (
            <Text style={styles.cityCountHint}>
              {cities.length}/{MAX_CMP} kota · Cari lagi untuk ganti yang lama
            </Text>
          )}

          {/* Riwayat */}
          {history.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionLabel}>◷  Terakhir Dicari</Text>
                <TouchableOpacity onPress={() => {
                  setHistory([]);
                  AsyncStorage.removeItem(KEY_HIST).catch(() => {});
                }}>
                  <Text style={styles.sectionAction}>Hapus</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.chipRow}>
                {history.map(k => (
                  <TouchableOpacity key={k} style={styles.chip} onPress={() => setQuery(k)}>
                    <Text style={styles.chipText}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Loading */}
          {loading && (
            <View style={styles.stateCenter}>
              <ActivityIndicator size="large" color="rgba(255,255,255,0.7)" />
              <Text style={styles.stateText}>Mengambil data cuaca...</Text>
            </View>
          )}

          {/* Error */}
          {error && !loading && (
            <View style={styles.errorBox}>
              <Text style={styles.errorIcon}>⚠</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.errorTitle}>Kota Tidak Ditemukan</Text>
                <Text style={styles.errorMsg}>{error}</Text>
              </View>
            </View>
          )}

          {/* Kartu cuaca */}
          {!loading && !error && cities.map(c => (
            <WeatherCard
              key={c.kota}
              data={c}
              isFav={favorites.includes(c.kota)}
              onFav={toggleFav}
              onJournal={() => { setJournalTarget(c); setShowJournal(true); }}
              onRemove={removeCity}
            />
          ))}

          {/* Empty state */}
          {!query && !loading && cities.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIco}>🌍</Text>
              <Text style={styles.emptyTitle}>Cari Kotamu</Text>
              <Text style={styles.emptySub}>
                Ketik nama kota untuk melihat cuaca.{'\n'}
                Tambahkan hingga {MAX_CMP} kota sekaligus untuk dibandingkan.
              </Text>
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ══════════════ TAB COMPARE ══════════════════════════════ */}
      {tab === 'compare' && (
        <ComparePanel cities={cities} />
      )}

      {/* ══════════════ TAB JOURNAL ══════════════════════════════ */}
      {tab === 'journal' && (
        <View style={{ flex: 1 }}>
          <View style={styles.journalHeader}>
            <Text style={styles.journalHeaderTitle}>📓 Weather Journal</Text>
            {journal.length > 0 && (
              <TouchableOpacity onPress={clearJournal}>
                <Text style={styles.journalClear}>Hapus Semua</Text>
              </TouchableOpacity>
            )}
          </View>
          {journal.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIco}>📝</Text>
              <Text style={styles.emptyTitle}>Belum Ada Catatan</Text>
              <Text style={styles.emptySub}>
                Buka tab Cari, lalu tap{'\n'}
                <Text style={{ color: '#FFD166', fontWeight: '700' }}>✏️ Catat Mood Hari Ini</Text>
                {'\n'}di kartu cuaca.
              </Text>
            </View>
          ) : (
            <FlatList
              data={journal}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.pad}
              renderItem={({ item }) => <JournalEntry entry={item} />}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      {/* ══════════════ TAB FAVORITES ════════════════════════════ */}
      {tab === 'fav' && (
        <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionLabel, { marginBottom: 14, marginTop: 6 }]}>
            ★  Kota Favorit ({favorites.length})
          </Text>
          {favorites.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIco}>☆</Text>
              <Text style={styles.emptyTitle}>Belum Ada Favorit</Text>
              <Text style={styles.emptySub}>
                Tap ★ di kartu cuaca untuk menyimpan kota favorit.
              </Text>
            </View>
          ) : (
            favorites.map(name => {
              const c = cities.find(c => c.kota === name);
              return c ? (
                <WeatherCard key={name} data={c} isFav onFav={toggleFav} compact />
              ) : (
                <TouchableOpacity key={name} style={styles.favChipRow} onPress={() => { setQuery(name); setTab('search'); }}>
                  <Text style={styles.favChipText}>★ {name}</Text>
                  <Text style={styles.favChipHint}>Tap untuk cari</Text>
                </TouchableOpacity>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── Modal jurnal mood ─────────────────────────────────── */}
      <MoodModal
        visible={showJournal}
        cuaca={journalTarget}
        onClose={() => { setShowJournal(false); setJournalTarget(null); }}
        onSave={saveJournal}
      />
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  safe:    { flex: 1 },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'android' ? 42 : 8,
    paddingBottom: 6,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  tabBtn: {
    flex: 1, alignItems: 'center',
    paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  tabBtnActive: {
    backgroundColor: 'rgba(255,209,102,0.18)',
    borderColor: 'rgba(255,209,102,0.4)',
  },
  tabBtnText:       { fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: '600' },
  tabBtnTextActive: { color: '#FFD166' },

  // Padding umum
  pad: { padding: 18, paddingBottom: 50 },

  // App header
  appHeader:  { alignItems: 'center', marginBottom: 20 },
  appTitle:   { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  appSub:     { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 3, letterSpacing: 0.6 },

  // Search
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    height: 48, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 14, gap: 10,
  },
  searchIcon:  { fontSize: 22, color: 'rgba(255,255,255,0.5)' },
  searchInput: { flex: 1, fontSize: 15, color: '#FFFFFF', padding: 0 },
  clearIcon:   { fontSize: 13, color: 'rgba(255,255,255,0.4)', padding: 4 },
  refreshBtn: {
    width: 48, height: 48,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 13, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  refreshIcon: { fontSize: 20, color: 'rgba(255,255,255,0.65)' },

  cityCountHint: { fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'right', marginBottom: 4 },

  // Section
  section:      { marginTop: 16 },
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 },
  sectionAction:{ fontSize: 12, color: 'rgba(255,255,255,0.3)' },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  chipText: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },

  // States
  stateCenter: { alignItems: 'center', marginTop: 48 },
  stateText:   { marginTop: 14, fontSize: 14, color: 'rgba(255,255,255,0.5)' },

  // Error
  errorBox: {
    flexDirection: 'row', gap: 14, marginTop: 18,
    backgroundColor: 'rgba(255,80,80,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,80,80,0.28)',
    borderRadius: 14, padding: 18,
  },
  errorIcon:  { fontSize: 20, color: '#FF5252', marginTop: 1 },
  errorTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  errorMsg:   { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 3 },

  // Card cuaca
  card: {
    borderRadius: 22, padding: 22, marginTop: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  cardCompact: { padding: 16 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTopActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge:       { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20 },
  badgeText:   { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardCity:    { fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  cardCountry: { fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 2, marginBottom: 8 },
  cardEmoji:   { fontSize: 64, textAlign: 'center', marginBottom: 6 },
  tempRow:     { flexDirection: 'row', alignItems: 'flex-start' },
  tempBig:     { fontSize: 68, fontWeight: '200', lineHeight: 72, letterSpacing: -3 },
  tempUnit:    { fontSize: 26, fontWeight: '300', marginTop: 8, marginLeft: 2 },
  cardLabel:   { fontSize: 15, color: 'rgba(255,255,255,0.6)', marginTop: 4, marginBottom: 14 },
  minMaxRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  minMaxText:  { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  minMaxSep:   { color: 'rgba(255,255,255,0.25)', fontSize: 13 },
  divider:     { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 14 },
  windRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  windArrow:   { fontSize: 28, color: '#FFFFFF' },
  windSpeed:   { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  windDir:     { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },

  // Mini forecast
  forecastLabel: { fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  forecastRow:   { flexDirection: 'row', justifyContent: 'space-around' },
  forecastCell:  { alignItems: 'center', gap: 4 },
  forecastDay:   { fontSize: 10, color: 'rgba(255,255,255,0.4)' },
  forecastMax:   { fontSize: 13, fontWeight: '700' },
  forecastMin:   { fontSize: 11, color: 'rgba(255,255,255,0.4)' },

  // Journal button inside card
  journalBtn: {
    marginTop: 16, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, alignItems: 'center',
  },
  journalBtnText: { fontSize: 13, fontWeight: '600' },

  // Empty state
  emptyWrap:  { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyIco:   { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.8)', marginBottom: 10 },
  emptySub:   { fontSize: 14, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 22 },

  // Modal mood
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalBox:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 26, paddingBottom: 40 },
  modalTitle:     { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  modalSub:       { fontSize: 14, color: 'rgba(255,255,255,0.55)', marginBottom: 20 },
  modalSection:   { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  moodGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  moodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  moodIcon:  { fontSize: 18 },
  moodLabel: { fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  notesInput: {
    borderWidth: 1, borderRadius: 12,
    padding: 14, color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.07)',
    fontSize: 14, minHeight: 80, marginBottom: 22,
    textAlignVertical: 'top',
  },
  modalActions:   { flexDirection: 'row', gap: 12 },
  cancelBtn:      { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  cancelBtnText:  { color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  saveBtn:        { flex: 2, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  saveBtnDisabled:{ opacity: 0.35 },
  saveBtnText:    { color: '#0F1B30', fontWeight: '800', fontSize: 15 },

  // Journal list
  journalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  journalHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  journalClear:       { fontSize: 12, color: 'rgba(255,80,80,0.7)' },
  journalCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14, padding: 16, marginBottom: 12,
    borderLeftWidth: 4, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  journalCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  journalMood:  { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  journalDate:  { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  journalCity:  { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  journalWeather:{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 },
  journalNotes: { fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 20 },

  // Compare
  comparePad: { padding: 18, paddingBottom: 50 },
  compareEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  compareEmptyIcon: { fontSize: 52, marginBottom: 16 },
  compareEmptyText: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 22 },
  compareHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  compareCity: { flex: 1, borderRadius: 18, padding: 18, alignItems: 'center', gap: 4 },
  compareCityEmoji: { fontSize: 40 },
  compareCityName:  { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  compareSuhu:      { fontSize: 22, fontWeight: '800' },
  compareVS:        { fontSize: 16, fontWeight: '800', color: 'rgba(255,255,255,0.4)' },
  compareRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10, padding: 14, marginBottom: 8,
  },
  compareVal:       { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  compareWinner:    { color: '#FFD166', fontSize: 18 },
  compareRowLabel:  { fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.8, width: 54, textAlign: 'center' },
  compareNote:      { fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 16, lineHeight: 18 },

  // Fav tab
  favChipRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,209,102,0.25)',
  },
  favChipText: { fontSize: 15, fontWeight: '700', color: '#FFD166' },
  favChipHint: { fontSize: 12, color: 'rgba(255,255,255,0.35)' },
});