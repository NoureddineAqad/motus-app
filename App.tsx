import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Animated, ActivityIndicator, SafeAreaView, Platform,
  Dimensions, StatusBar, Vibration,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Config ───────────────────────────────────────────────────────────────────
const API_BASE_URL = 'https://api.nour-aqad.uk/api';
const MAX_ESSAIS   = 7;
const STORAGE_JOUR  = 'motus_jour_v5';
const STORAGE_SERIE = 'motus_serie_v5';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  fond:        '#1a0a2e',
  surface:     '#2d1f4e',
  correct:     '#c0392b',
  absent:      '#2c2c3e',
  vide:        '#3d2d6e',
  bordure:     '#6c5ea0',
  texte:       '#f0e6ff',
  texteSombre: '#8a7aaa',
  clavier:     '#3d2d6e',
  accent:      '#9b59b6',
  orange:      '#e67e22',
};

const TAILLE_CASE = Math.min(Math.floor((SCREEN_WIDTH - 32) / 9), 48);
const TAILLE_TOUCHE_H = 54;

// ─── Types ────────────────────────────────────────────────────────────────────
type Evaluation = 'correct' | 'present' | 'absent';
type EtatPartie = 'en_cours' | 'gagne' | 'perdu';
type Mode       = 'jour' | 'serie';
interface Tentative { lettres: string[]; evaluation: Evaluation[]; }

// ─── API ──────────────────────────────────────────────────────────────────────
async function apiFetch(path: string, opts: RequestInit = {}) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(API_BASE_URL + path, { ...opts, signal: ctrl.signal });
    clearTimeout(id);
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`); }
    return r.json();
  } catch (e: any) {
    clearTimeout(id);
    if (e.name === 'AbortError') throw new Error('Délai dépassé. Vérifiez votre connexion.');
    throw e;
  }
}

async function getPlayerId() {
  let id = await AsyncStorage.getItem('motus_pid');
  if (!id) { id = 'p_' + Math.random().toString(36).slice(2); await AsyncStorage.setItem('motus_pid', id); }
  return id!;
}

// ─── Case lettre ──────────────────────────────────────────────────────────────
function CaseLettre({ lettre, evaluation, indicatif = false }: {
  lettre: string; evaluation?: Evaluation | null; indicatif?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const prev  = useRef('');

  useEffect(() => {
    // Animation uniquement sur la ligne de saisie (pas d'evaluation)
    // et seulement si la lettre vient d'être ajoutée
    if (lettre && lettre !== prev.current && !evaluation) {
      scale.setValue(1);
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.18, duration: 70, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,    duration: 70, useNativeDriver: true }),
      ]).start();
    }
    prev.current = lettre;
  }, [lettre, evaluation]);

  let bg = C.vide, borderColor = C.bordure, borderWidth = 1.5, color = C.texte;
  let isPresent = false;

  if (evaluation === 'correct') {
    bg = C.correct; borderColor = C.correct; borderWidth = 0;
  } else if (evaluation === 'present') {
    isPresent = true; bg = C.absent; borderColor = C.absent; borderWidth = 0; color = '#1a0a2e';
  } else if (evaluation === 'absent') {
    bg = C.absent; borderColor = C.absent; color = C.texteSombre;
  } else if (lettre && !indicatif) {
    borderColor = C.accent; borderWidth = 2;
  } else if (indicatif) {
    bg = C.correct; borderColor = C.correct; borderWidth = 0;
  }

  return (
    <Animated.View style={[
      styles.case,
      { backgroundColor: bg, borderColor, borderWidth, opacity: indicatif ? 0.45 : 1 },
      !evaluation && { transform: [{ scale }] },
    ]}>
      {isPresent && <View style={styles.cerclePresentCase} />}
      <Text style={[styles.caseTexte, { color, zIndex: 1 }]}>{lettre}</Text>
    </Animated.View>
  );
}

// ─── Ligne tentative ──────────────────────────────────────────────────────────
function LigneTentative({ lettres, evaluation, longueur }: {
  lettres: string[]; evaluation?: Evaluation[]; longueur: number;
}) {
  return (
    <View style={styles.ligne}>
      {Array.from({ length: longueur }).map((_, i) => (
        <CaseLettre key={`${i}-${lettres[i] || ''}-${evaluation?.[i] || ''}`} lettre={lettres[i] || ''} evaluation={evaluation?.[i]} />
      ))}
    </View>
  );
}

// ─── Ligne saisie ─────────────────────────────────────────────────────────────
function LigneSaisie({ motEnCours, longueur, lettresCorrectes, premiereLettreJ }: {
  motEnCours: string[]; longueur: number;
  lettresCorrectes: Record<number, string>; premiereLettreJ: string;
}) {
  return (
    <View style={styles.ligne}>
      {Array.from({ length: longueur }).map((_, i) => {
        const saisie    = motEnCours[i] || '';
        const connue    = i === 0 ? premiereLettreJ : (lettresCorrectes[i] || '');
        const lettre    = saisie || connue;
        const indicatif = !saisie && !!connue && i > 0;
        const isCorrect = !!saisie && (i === 0 || lettresCorrectes[i] === saisie);
        return (
          <CaseLettre key={i} lettre={lettre}
            evaluation={isCorrect ? 'correct' : undefined}
            indicatif={indicatif} />
        );
      })}
    </View>
  );
}

// ─── Clavier ──────────────────────────────────────────────────────────────────
// Rangée 3 : ✕ à gauche, ↵ à droite
const RANGEES = [
  ['A','Z','E','R','T','Y','U','I','O','P'],
  ['Q','S','D','F','G','H','J','K','L','M'],
  ['✕','W','X','C','V','B','N','⌫','↵'],
];

function Clavier({ statut, onTouche, desactive }: {
  statut: Record<string, Evaluation>; onTouche: (t: string) => void; desactive: boolean;
}) {
  return (
    <View style={styles.clavier}>
      {RANGEES.map((rangee, ri) => (
        <View key={ri} style={styles.rangee}>
          {rangee.map(t => {
            const s         = statut[t];
            let bg          = C.clavier;
            let color       = C.texte;
            let isPresent   = false;
            const speciale  = ['↵','⌫','✕'].includes(t);

            if      (t === '↵') bg = C.accent;
            else if (t === '⌫') bg = '#4a3060';
            else if (t === '✕') bg = '#2a1040';
            else if (s === 'correct') bg = C.correct;
            else if (s === 'present') { isPresent = true; }
            else if (s === 'absent')  { bg = '#1a1028'; color = '#5a4a7a'; }

            const borderStyle = s === 'absent' ? { borderWidth: 1, borderColor: '#3a2a5a' } : {};
            return (
              <TouchableOpacity
                key={t}
                style={[styles.touche, speciale && styles.toucheSpeciale, { backgroundColor: bg }, borderStyle]}
                onPress={() => { if (!desactive) { Vibration.vibrate(20); onTouche(t); } }}
                hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                activeOpacity={0.7}
              >
                {isPresent && <View style={styles.cerclePresentTouche} />}
                <Text style={[styles.toucheTexte, { color, zIndex: 1 }]}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Barre de progression série ───────────────────────────────────────────────
function ProgressionSerie({ statuts, index }: { statuts: string[]; index: number }) {
  return (
    <View style={styles.progression}>
      {statuts.map((s, i) => (
        <View key={i} style={[
          styles.progressionBar,
          s === 'gagne' ? { backgroundColor: C.correct } :
          s === 'perdu' ? { backgroundColor: '#6b2020' } :
          i === index   ? { backgroundColor: C.accent }  :
                          { backgroundColor: C.vide },
        ]} />
      ))}
    </View>
  );
}

// ─── Modal fin de partie ──────────────────────────────────────────────────────
function ModalFin({ mode, etat, motCible, nbEssais, serieStatuts, serieEssais,
  serieMotsCibles, onAutreMode, onMenu }: {
  mode: Mode; etat: EtatPartie; motCible: string; nbEssais: number;
  serieStatuts: string[]; serieEssais: number[]; serieMotsCibles: string[];
  onAutreMode: () => void; onMenu: () => void;
}) {
  const [mots, setMots] = useState<string[]>(serieMotsCibles);
  const [loading, setLoading] = useState(false);

  // Charger les mots si manquants (sauvegarde ancienne version ou restore)
  useEffect(() => {
    if (mode === 'serie' && mots.every(m => !m)) {
      setLoading(true);
      apiFetch('/serie/abandon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: 'restore' }),
      }).then(ab => {
        const tousLesMots = Array(5).fill('');
        ab.mots.forEach((m: any) => { tousLesMots[m.index] = m.motCible; });
        setMots(tousLesMots);
      }).catch(() => {}).finally(() => setLoading(false));
    }
  }, []);

  if (mode === 'jour') {
    const gagne = etat === 'gagne';
    return (
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalEmoji}>{gagne ? '🎉' : '😞'}</Text>
          <Text style={styles.modalTitre}>{gagne ? 'Bravo !' : 'Perdu !'}</Text>
          <Text style={styles.modalSub}>
            {gagne
              ? `Trouvé en ${nbEssais} essai${nbEssais > 1 ? 's' : ''} sur ${MAX_ESSAIS}`
              : 'Vous avez épuisé vos 7 essais.'}
          </Text>
          <Text style={styles.modalLabel}>Le mot était :</Text>
          <Text style={styles.modalMot}>{motCible}</Text>
          <Text style={styles.modalSub}>Revenez demain pour un nouveau mot ! 🕛</Text>
          <TouchableOpacity style={styles.modalBtn} onPress={onAutreMode}>
            <Text style={styles.modalBtnTxt}>🔢 Tenter la série du jour</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSec]} onPress={onMenu}>
            <Text style={[styles.modalBtnTxt, { color: C.texteSombre }]}>← Menu principal</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Série
  const total = serieStatuts.filter(s => s === 'gagne').length;
  const ok    = total === 5;
  return (
    <View style={styles.overlay}>
      <View style={styles.modalBox}>
        <Text style={styles.modalEmoji}>{ok ? '🏆' : total > 0 ? '👍' : '😞'}</Text>
        <Text style={styles.modalTitre}>{ok ? 'Série complète !' : `${total}/5 mots trouvés`}</Text>
        {loading
          ? <ActivityIndicator color={C.accent} style={{ marginVertical: 8 }} />
          : serieStatuts.map((s, i) => (
            <View key={i} style={styles.serieLigne}>
              <Text style={styles.serieEmoji}>{s === 'gagne' ? '✅' : s === 'perdu' ? '❌' : '⏭️'}</Text>
              <Text style={styles.serieMot}>{mots[i] || '...'}</Text>
              <Text style={styles.serieEssais}>{serieEssais[i] > 0 ? `${serieEssais[i]} essai${serieEssais[i] > 1 ? 's' : ''}` : ''}</Text>
            </View>
          ))
        }
        <Text style={styles.modalSub}>Revenez demain pour une nouvelle série ! 🕛</Text>
        <TouchableOpacity style={styles.modalBtn} onPress={onAutreMode}>
          <Text style={styles.modalBtnTxt}>🔤 Tenter le mot du jour</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSec]} onPress={onMenu}>
          <Text style={[styles.modalBtnTxt, { color: C.texteSombre }]}>← Menu principal</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Écran d'accueil ──────────────────────────────────────────────────────────
function EcranAccueil({ onMode }: { onMode: (m: Mode) => void }) {
  return (
    <SafeAreaView style={styles.conteneur}>
      <StatusBar barStyle="light-content" backgroundColor={C.fond} />
      <View style={styles.accueil}>
        <Text style={styles.accueilTitre}>MOTUS</Text>
        <Text style={styles.accueilSub}>Choisissez votre mode de jeu</Text>

        <TouchableOpacity style={styles.modeCard} onPress={() => onMode('jour')} activeOpacity={0.85}>
          <Text style={styles.modeCardTitre}>MOT DU JOUR</Text>
          <Text style={styles.modeCardDesc}>Un mot commun à deviner chaque jour.{'\n'}6 à 10 lettres · 7 essais · Même mot pour tous.</Text>
          <View style={[styles.badge, { backgroundColor: C.accent }]}><Text style={styles.badgeTxt}>1 MOT</Text></View>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.modeCard, { borderColor: C.orange }]} onPress={() => onMode('serie')} activeOpacity={0.85}>
          <Text style={styles.modeCardTitre}>SÉRIE DU JOUR</Text>
          <Text style={styles.modeCardDesc}>5 mots à enchaîner, du plus court au plus long.{'\n'}5 → 6 → 7 → 8 → 9 lettres · 7 essais par mot.</Text>
          <View style={[styles.badge, { backgroundColor: C.orange }]}><Text style={styles.badgeTxt}>5 MOTS</Text></View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Écran de jeu ─────────────────────────────────────────────────────────────
function EcranJeu({ mode, onMenu, onAutreMode }: {
  mode: Mode; onMenu: () => void; onAutreMode: () => void;
}) {
  // ── État ──
  const [chargement, setChargement] = useState(true);
  const [erreur,     setErreur]     = useState('');
  const [dateDuJour, setDateDuJour] = useState('');

  // Mot courant
  const [longueur,       setLongueur]       = useState(6);
  const [premiereLettreJ,setPremiereLettreJ]= useState('');
  const [motEnCours,     setMotEnCours]     = useState<string[]>([]);
  const cursorRef                           = useRef(1);   // ← ref pour éviter closure stale
  const [cursorUI,       setCursorUI]       = useState(1); // ← pour le rendu
  const motRef                              = useRef<string[]>([]); // ← source de vérité du mot
  const processingRef                       = useRef(false); // ← verrou anti-double-tap
  const [etatPartie,     setEtatPartie]     = useState<EtatPartie>('en_cours');
  const [tentatives,     setTentatives]     = useState<Tentative[]>([]);
  const [lettresStatut,  setLettresStatut]  = useState<Record<string, Evaluation>>({});
  const [lettresCorrectes,setLettresCorrectes]= useState<Record<number, string>>({});
  const [motCible,       setMotCible]       = useState('');
  const [msgErr,         setMsgErr]         = useState('');

  // Série
  const [serieMots,   setSerieMots]   = useState<any[]>([]);
  const [serieIndex,  setSerieIndex]  = useState(0);
  const [serieStatuts,setSerieStatuts]= useState<string[]>(Array(5).fill('en_attente'));
  const [serieEssais, setSerieEssais] = useState<number[]>(Array(5).fill(0));
  const [serieMotsCibles, setSerieMotsCibles] = useState<string[]>(Array(5).fill(''));

  const playerIdRef = useRef('');

  // ── initSaisie ────────────────────────────────────────────────────────────
  const initSaisie = useCallback((pl: string, lon: number) => {
    const arr = Array(lon).fill('');
    arr[0]        = pl;
    cursorRef.current = 1;
    setCursorUI(1);
    motRef.current = arr;
    processingRef.current = false;
    setMotEnCours(arr);
  }, []);

  // ── Chargement ────────────────────────────────────────────────────────────
  useEffect(() => { load(); }, [mode]);

  async function load() {
    try {
      setChargement(true); setErreur('');
      setTentatives([]); setLettresStatut({}); setLettresCorrectes({});
      setEtatPartie('en_cours'); setMotCible(''); setMsgErr('');
      setSerieMotsCibles(Array(5).fill(''));
      playerIdRef.current = await getPlayerId();
      mode === 'jour' ? await loadJour() : await loadSerie();
    } catch (e: any) { setErreur(e.message || 'Connexion impossible'); }
    finally { setChargement(false); }
  }

  async function loadJour() {
    const info = await apiFetch('/info');
    setDateDuJour(info.date); setLongueur(info.longueur); setPremiereLettreJ(info.premiereLettre);
    const raw = await AsyncStorage.getItem(STORAGE_JOUR);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.date === info.date) {
        setTentatives(s.tentatives || []);
        setLettresStatut(s.lettresStatut || {});
        setLettresCorrectes(s.lettresCorrectes || {});
        setEtatPartie(s.etatPartie || 'en_cours');
        setMotCible(s.motCible || '');
        initSaisie(info.premiereLettre, info.longueur);
        return;
      }
    }
    initSaisie(info.premiereLettre, info.longueur);
  }

  async function loadSerie() {
    const info = await apiFetch('/serie/info');
    setDateDuJour(info.date); setSerieMots(info.mots);
    const raw = await AsyncStorage.getItem(STORAGE_SERIE);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.date === info.date) {
        const idx = s.serieIndex || 0;
        setSerieIndex(idx); setSerieStatuts(s.serieStatuts || Array(5).fill('en_attente'));
        setSerieEssais(s.serieEssais || Array(5).fill(0));
        setTentatives(s.tentativesCourantes || []);
        setLettresStatut(s.lettresStatut || {});
        setLettresCorrectes(s.lettresCorrectes || {});
        setEtatPartie(s.etatPartie || 'en_cours');
        setMotCible(s.motCible || '');
        if (s.serieMotsCibles?.length) setSerieMotsCibles(s.serieMotsCibles);
        const m = info.mots[idx];
        setLongueur(m.longueur); setPremiereLettreJ(m.premiereLettre);
        initSaisie(m.premiereLettre, m.longueur);
        return;
      }
    }
    const st = Array(5).fill('en_attente'); st[0] = 'en_cours';
    setSerieStatuts(st); setSerieEssais(Array(5).fill(0)); setSerieIndex(0);
    const m = info.mots[0]; setLongueur(m.longueur); setPremiereLettreJ(m.premiereLettre);
    initSaisie(m.premiereLettre, m.longueur);
  }

  // ── Sauvegarde ────────────────────────────────────────────────────────────
  async function saveJour(t: Tentative[], ls: any, lc: any, ep: EtatPartie, mc: string, date: string) {
    await AsyncStorage.setItem(STORAGE_JOUR, JSON.stringify({ date, tentatives: t, lettresStatut: ls, lettresCorrectes: lc, etatPartie: ep, motCible: mc }));
  }
  async function saveSerie(idx: number, st: string[], se: number[], t: Tentative[], ls: any, lc: any, ep: EtatPartie, mc: string, date: string, smc?: string[]) {
    await AsyncStorage.setItem(STORAGE_SERIE, JSON.stringify({ date, serieIndex: idx, serieStatuts: st, serieEssais: se, tentativesCourantes: t, lettresStatut: ls, lettresCorrectes: lc, etatPartie: ep, motCible: mc, serieMotsCibles: smc || [] }));
  }

  // ── Actions clavier ───────────────────────────────────────────────────────
  function appuyerLettre(lettre: string) {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      const cur = cursorRef.current;
      if (cur >= motRef.current.length) return;
      const next = [...motRef.current];
      next[cur] = lettre;
      motRef.current = next;
      cursorRef.current = Math.min(cur + 1, motRef.current.length - 1 + 1);
      setCursorUI(cursorRef.current);
      setMotEnCours([...next]);
      setMsgErr('');
    } finally {
      processingRef.current = false;
    }
  }

  function effacer() {
    const cur = cursorRef.current;
    if (cur <= 1) return;
    const newCur = cur - 1;
    const next = [...motRef.current];
    next[newCur] = '';
    motRef.current = next;
    cursorRef.current = newCur;
    setCursorUI(newCur);
    setMotEnCours([...next]);
    setMsgErr('');
  }

  function toutEffacer() {
    const next = Array(motRef.current.length).fill('');
    next[0] = premiereLettreJ;
    motRef.current = next;
    cursorRef.current = 1;
    setCursorUI(1);
    setMotEnCours([...next]);
    setMsgErr('');
  }

  async function valider() {
    const cur = cursorRef.current;
    // Construire le mot à valider (lettres saisies + indicatives)
    const motAValider = motRef.current.map((l, i) =>
      l || (i === 0 ? premiereLettreJ : (lettresCorrectes[i] || ''))
    );
    if (motAValider.some(l => !l)) { setMsgErr(`Le mot doit contenir ${longueur} lettres.`); return; }
    const motStr = motAValider.join('');
    setMsgErr('');

    try {
      const body = { tentative: motStr, playerId: playerIdRef.current, ...(mode === 'serie' ? { indexMot: serieIndex } : {}) };
      const res  = await apiFetch(mode === 'jour' ? '/tentative' : '/serie/tentative', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });

      const nouvTent: Tentative = { lettres: motAValider, evaluation: res.evaluation };
      const nouvTentatives      = [...tentatives, nouvTent];

      // Statut clavier + lettres correctes
      const prio: Record<string, number> = { correct: 3, present: 2, absent: 1 };
      const nouvLS = { ...lettresStatut };
      const nouvLC = { ...lettresCorrectes };
      motAValider.forEach((l, i) => {
        const e = res.evaluation[i] as Evaluation;
        if (!nouvLS[l] || prio[e] > prio[nouvLS[l]]) nouvLS[l] = e;
        if (e === 'correct') nouvLC[i] = l;
      });

      setTentatives(nouvTentatives);
      setLettresStatut(nouvLS);
      setLettresCorrectes(nouvLC);

      if (res.gagne) {
        const mc = res.motCible || motStr;
        setMotCible(mc);
        if (mode === 'jour') {
          setEtatPartie('gagne');
          await saveJour(nouvTentatives, nouvLS, nouvLC, 'gagne', mc, dateDuJour);
        } else {
          const nouvSt = [...serieStatuts]; nouvSt[serieIndex] = 'gagne';
          const nouvSe = [...serieEssais];  nouvSe[serieIndex] = nouvTentatives.length;
          setSerieStatuts(nouvSt); setSerieEssais(nouvSe);
          const nouvMC = [...serieMotsCibles]; nouvMC[serieIndex] = mc;
          setSerieMotsCibles(nouvMC);
          if (serieIndex < 4) {
            await saveSerie(serieIndex, nouvSt, nouvSe, nouvTentatives, nouvLS, nouvLC, 'en_cours', mc, dateDuJour);
            setTimeout(() => passerMotSuivant(serieIndex + 1, nouvSt, nouvSe, nouvLS, dateDuJour), 1200);
          } else {
            // Dernier mot trouvé → récupérer tous les mots pour la modal finale
            try {
              const ab = await apiFetch('/serie/abandon', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId: playerIdRef.current }),
              });
              const tousLesMots = Array(5).fill('');
              ab.mots.forEach((m: any) => { tousLesMots[m.index] = m.motCible; });
              setSerieMotsCibles(tousLesMots);
            } catch (_) {}
            setEtatPartie('gagne');
            await saveSerie(4, nouvSt, nouvSe, nouvTentatives, nouvLS, nouvLC, 'gagne', mc, dateDuJour, tousLesMots);
          }
        }
        return;
      }

      if (nouvTentatives.length >= MAX_ESSAIS) {
        let mc = '';
        let nouveauxMC = [...serieMotsCibles];
        try {
          const ab = await apiFetch(mode === 'jour' ? '/abandon' : '/serie/abandon', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: playerIdRef.current }),
          });
          if (mode === 'jour') {
            mc = ab.motCible;
          } else {
            mc = ab.mots[serieIndex]?.motCible || '';
            // Stocker tous les mots révélés
            ab.mots.forEach((m: any) => { nouveauxMC[m.index] = m.motCible; });
            setSerieMotsCibles(nouveauxMC);
          }
        } catch (_) {}
        setMotCible(mc);
        if (mode === 'jour') {
          setEtatPartie('perdu');
          await saveJour(nouvTentatives, nouvLS, nouvLC, 'perdu', mc, dateDuJour);
        } else {
          const nouvSt = [...serieStatuts]; nouvSt[serieIndex] = 'perdu';
          const nouvSe = [...serieEssais];  nouvSe[serieIndex] = nouvTentatives.length;
          setSerieStatuts(nouvSt); setSerieEssais(nouvSe);
          if (serieIndex < 4) {
            await saveSerie(serieIndex, nouvSt, nouvSe, nouvTentatives, nouvLS, nouvLC, 'en_cours', mc, dateDuJour);
            setTimeout(() => passerMotSuivant(serieIndex + 1, nouvSt, nouvSe, nouvLS, dateDuJour), 1200);
          } else {
            // Dernier mot perdu → tous les mots déjà récupérés via abandon ci-dessus
            setEtatPartie('perdu');
            await saveSerie(4, nouvSt, nouvSe, nouvTentatives, nouvLS, nouvLC, 'perdu', mc, dateDuJour, nouveauxMC);
          }
        }
        return;
      }

      // Continuer — réinitialiser la ligne de saisie
      initSaisie(premiereLettreJ, longueur);
      if (mode === 'jour') await saveJour(nouvTentatives, nouvLS, nouvLC, 'en_cours', '', dateDuJour);
      else await saveSerie(serieIndex, serieStatuts, serieEssais, nouvTentatives, nouvLS, nouvLC, 'en_cours', '', dateDuJour);

    } catch (e: any) { setMsgErr(e.message || 'Erreur réseau.'); }
  }

  async function passerMotSuivant(idx: number, st: string[], se: number[], ls: Record<string, Evaluation>, date: string) {
    const nouvSt = [...st]; nouvSt[idx] = 'en_cours';
    const m      = serieMots[idx];
    setSerieIndex(idx); setSerieStatuts(nouvSt);
    setTentatives([]); setLettresStatut(ls); setLettresCorrectes({});
    setEtatPartie('en_cours'); setMotCible('');
    setLongueur(m.longueur); setPremiereLettreJ(m.premiereLettre);
    initSaisie(m.premiereLettre, m.longueur);
    await saveSerie(idx, nouvSt, se, [], ls, {}, 'en_cours', '', date);
  }

  function gererTouche(t: string) {
    if (etatPartie !== 'en_cours') return;
    if (t === '⌫') effacer();
    else if (t === '✕') toutEffacer();
    else if (t === '↵') valider();
    else appuyerLettre(t);
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────
  const lignesVides    = MAX_ESSAIS - tentatives.length - (etatPartie === 'en_cours' ? 1 : 0);
  const afficherModal  = etatPartie !== 'en_cours' && (mode === 'jour' || serieIndex === 4);

  if (chargement) return (
    <SafeAreaView style={[styles.conteneur, styles.centrer]}>
      <ActivityIndicator size="large" color={C.accent} />
      <Text style={{ color: C.texteSombre, marginTop: 16 }}>Connexion…</Text>
    </SafeAreaView>
  );

  if (erreur) return (
    <SafeAreaView style={[styles.conteneur, styles.centrer]}>
      <Text style={{ fontSize: 44 }}>📡</Text>
      <Text style={{ color: C.texte, fontSize: 18, marginVertical: 12 }}>Connexion impossible</Text>
      <Text style={{ color: C.texteSombre, textAlign: 'center', marginBottom: 20 }}>{erreur}</Text>
      <TouchableOpacity style={styles.modalBtn} onPress={load}>
        <Text style={styles.modalBtnTxt}>Réessayer</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSec, { marginTop: 10 }]} onPress={onMenu}>
        <Text style={[styles.modalBtnTxt, { color: C.texteSombre }]}>← Menu</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.conteneur}>
      <StatusBar barStyle="light-content" backgroundColor={C.fond} />

      {/* En-tête */}
      <View style={styles.entete}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={onMenu} style={{ padding: 4 }}>
            <Text style={{ color: C.texteSombre, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={styles.titre}>{mode === 'jour' ? 'MOTUS' : 'SÉRIE'}</Text>
        </View>
        <View style={styles.compteur}>
          <Text style={styles.compteurTxt}>{MAX_ESSAIS - tentatives.length} essai{MAX_ESSAIS - tentatives.length > 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* Progression série */}
      {mode === 'serie' && <ProgressionSerie statuts={serieStatuts} index={serieIndex} />}

      {/* Info */}
      <Text style={styles.info}>
        {'Commence par '}
        <Text style={{ color: C.correct, fontWeight: '800' }}>{premiereLettreJ}</Text>
        {' · '}
        <Text style={{ color: C.correct, fontWeight: '800' }}>{longueur}</Text>
        {' lettres'}
        {mode === 'serie' ? <Text style={{ color: C.accent, fontWeight: '700' }}>{`  ·  Mot ${serieIndex + 1}/5`}</Text> : null}
      </Text>

      {/* Grille */}
      <ScrollView contentContainerStyle={styles.grille} scrollEnabled={false}>
        {tentatives.map((t, i) => (
          <LigneTentative key={`tentative-${i}-${t.lettres.join('')}`} lettres={t.lettres} evaluation={t.evaluation} longueur={longueur} />
        ))}
        {etatPartie === 'en_cours' && (
          <LigneSaisie motEnCours={motEnCours} longueur={longueur}
            lettresCorrectes={lettresCorrectes} premiereLettreJ={premiereLettreJ} />
        )}
        {Array.from({ length: lignesVides }).map((_, i) => (
          <LigneTentative key={`vide-${tentatives.length}-${i}`} lettres={[]} longueur={longueur} />
        ))}
      </ScrollView>

      {/* Message erreur */}
      {msgErr ? (
        <View style={styles.bandeauErr}>
          <Text style={{ color: '#ffaaaa', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{msgErr}</Text>
        </View>
      ) : null}

      {/* Clavier */}
      <Clavier statut={lettresStatut} onTouche={gererTouche} desactive={etatPartie !== 'en_cours'} />

      {/* Modal fin */}
      {afficherModal && (
        <ModalFin mode={mode} etat={etatPartie} motCible={motCible}
          nbEssais={tentatives.length} serieStatuts={serieStatuts} serieEssais={serieEssais}
          serieMotsCibles={serieMotsCibles}
          onAutreMode={onAutreMode} onMenu={onMenu} />
      )}
    </SafeAreaView>
  );
}

// ─── App racine ───────────────────────────────────────────────────────────────
export default function App() {
  const [ecran, setEcran] = useState<'accueil' | Mode>('accueil');

  return ecran === 'accueil'
    ? <EcranAccueil onMode={m => setEcran(m)} />
    : <EcranJeu
        key={ecran}           // ← force remontage complet au changement de mode
        mode={ecran as Mode}
        onMenu={() => setEcran('accueil')}
        onAutreMode={() => setEcran(ecran === 'jour' ? 'serie' : 'jour')}
      />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  conteneur: { flex: 1, backgroundColor: C.fond },
  centrer:   { justifyContent: 'center', alignItems: 'center', padding: 24 },

  // Accueil
  accueil:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 },
  accueilTitre:  { fontSize: 44, fontWeight: '900', color: C.texte, letterSpacing: 12, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  accueilSub:    { fontSize: 14, color: C.texteSombre, textAlign: 'center' },
  modeCard:      { width: '100%', backgroundColor: C.surface, borderRadius: 16, padding: 22, borderWidth: 1.5, borderColor: C.accent, gap: 8 },
  modeCardTitre: { fontSize: 17, fontWeight: '900', color: C.texte, letterSpacing: 3 },
  modeCardDesc:  { fontSize: 13, color: C.texteSombre, lineHeight: 19 },
  badge:         { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 3 },
  badgeTxt:      { fontSize: 11, fontWeight: '700', color: C.texte },

  // En-tête
  entete:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#3d2d6e' },
  titre:      { fontSize: 22, fontWeight: '900', color: C.texte, letterSpacing: 6, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  compteur:   { backgroundColor: C.surface, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: C.accent },
  compteurTxt:{ color: C.accent, fontSize: 12, fontWeight: '700' },

  // Progression
  progression:    { flexDirection: 'row', paddingHorizontal: 18, paddingVertical: 8, gap: 6 },
  progressionBar: { flex: 1, height: 6, borderRadius: 3 },

  // Info
  info: { color: C.texteSombre, fontSize: 13, textAlign: 'center', paddingVertical: 6, paddingHorizontal: 12 },

  // Grille
  grille: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, gap: 5 },
  ligne:  { flexDirection: 'row', gap: 5 },

  // Case
  case:      { width: TAILLE_CASE, height: TAILLE_CASE, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.bordure, overflow: 'hidden' },
  caseTexte: { fontSize: TAILLE_CASE * 0.46, fontWeight: '900', color: C.texte, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  cerclePresentCase: { position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderRadius: 999, backgroundColor: '#FFD700', zIndex: 0 },

  // Clavier
  clavier: { paddingHorizontal: 4, paddingBottom: 16, gap: 6 },
  rangee:  { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  touche:  { minWidth: 34, height: TAILLE_TOUCHE_H, paddingHorizontal: 4, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: C.clavier, overflow: 'hidden' },
  toucheSpeciale:  { minWidth: 46 },
  toucheTexte:     { fontSize: 16, fontWeight: '800', color: C.texte, zIndex: 1, fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif' },
  cerclePresentTouche: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: 999, backgroundColor: '#FFD700', opacity: 0.45, zIndex: 0 },

  // Erreur
  bandeauErr: { backgroundColor: '#5a1a1a', marginHorizontal: 16, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 6 },

  // Modal
  overlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,5,25,0.93)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox:    { backgroundColor: C.surface, borderRadius: 20, padding: 26, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: C.accent, gap: 10 },
  modalEmoji:  { fontSize: 46 },
  modalTitre:  { fontSize: 24, fontWeight: '900', color: C.texte, letterSpacing: 2, textAlign: 'center' },
  modalSub:    { fontSize: 13, color: C.texteSombre, textAlign: 'center' },
  modalLabel:  { fontSize: 12, color: C.texteSombre },
  modalMot:    { fontSize: 28, fontWeight: '900', color: C.correct, letterSpacing: 5, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  modalBtn:    { width: '100%', backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnSec: { backgroundColor: C.vide },
  modalBtnTxt: { fontSize: 15, fontWeight: '700', color: C.texte },

  // Série modal
  serieLigne:  { flexDirection: 'row', width: '100%', alignItems: 'center', backgroundColor: C.vide, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, gap: 10 },
  serieEmoji:  { fontSize: 18 },
  serieMot:    { flex: 1, fontWeight: '700', color: C.texte },
  serieEssais: { fontSize: 12, color: C.texteSombre },
});
