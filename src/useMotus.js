import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getInfoJeu, soumettreTentative, abandonner } from './api';

const MAX_ESSAIS = 7;
const STORAGE_KEY = 'motus_etat_journalier';

async function getPlayerId() {
  let id = await AsyncStorage.getItem('motus_player_id');
  if (!id) {
    id = 'player_' + Math.random().toString(36).substring(2, 15);
    await AsyncStorage.setItem('motus_player_id', id);
  }
  return id;
}

export function useMotus() {
  const [chargement, setChargement] = useState(true);
  const [erreurReseau, setErreurReseau] = useState(null);
  const [dateDuJour, setDateDuJour] = useState('');
  const [longueurMot, setLongueurMot] = useState(6);
  const [premiereLettre, setPremiereLettre] = useState('');
  const [motCible, setMotCible] = useState('');
  const [tentatives, setTentatives] = useState([]);
  const [motEnCours, setMotEnCours] = useState([]);
  const [etatPartie, setEtatPartie] = useState('en_cours');
  const [messageErreur, setMessageErreur] = useState('');
  const [lettresStatut, setLettresStatut] = useState({});
  const playerIdRef = useRef(null);

  useEffect(() => { initialiser(); }, []);

  async function initialiser() {
    try {
      setChargement(true);
      setErreurReseau(null);
      playerIdRef.current = await getPlayerId();
      const info = await getInfoJeu();
      setDateDuJour(info.date);
      setLongueurMot(info.longueur);
      setPremiereLettre(info.premiereLettre);

      const sauvegarde = await AsyncStorage.getItem(STORAGE_KEY);
      if (sauvegarde) {
        const etat = JSON.parse(sauvegarde);
        if (etat.date === info.date) {
          setTentatives(etat.tentatives || []);
          setLettresStatut(etat.lettresStatut || {});
          setEtatPartie(etat.etatPartie || 'en_cours');
          setMotCible(etat.motCible || '');
          setMotEnCours([info.premiereLettre]);
          setChargement(false);
          return;
        }
      }

      setTentatives([]);
      setLettresStatut({});
      setEtatPartie('en_cours');
      setMotCible('');
      setMotEnCours([info.premiereLettre]);
    } catch (err) {
      setErreurReseau(err.message || 'Impossible de contacter le serveur.');
    } finally {
      setChargement(false);
    }
  }

  async function sauvegarder(nouvTentatives, nouvStatut, nouvEtat, nouvMotCible) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      date: dateDuJour,
      tentatives: nouvTentatives,
      lettresStatut: nouvStatut,
      etatPartie: nouvEtat,
      motCible: nouvMotCible || ''
    }));
  }

  const appuyerLettre = useCallback((lettre) => {
    if (etatPartie !== 'en_cours') return;
    if (motEnCours.length >= longueurMot) return;
    setMessageErreur('');
    setMotEnCours(prev => [...prev, lettre.toUpperCase()]);
  }, [etatPartie, motEnCours.length, longueurMot]);

  const effacerLettre = useCallback(() => {
    if (etatPartie !== 'en_cours') return;
    setMotEnCours(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
    setMessageErreur('');
  }, [etatPartie]);

  const validerTentative = useCallback(async () => {
    if (etatPartie !== 'en_cours') return;
    if (motEnCours.length !== longueurMot) {
      setMessageErreur(`Le mot doit contenir ${longueurMot} lettres.`);
      return;
    }

    const motStr = motEnCours.join('');
    setMessageErreur('');

    try {
      const resultat = await soumettreTentative(motStr, playerIdRef.current);
      const nouvelleTentative = {
        lettres: motEnCours,
        evaluation: resultat.evaluation
      };
      const nouvTentatives = [...tentatives, nouvelleTentative];

      const nouvStatut = { ...lettresStatut };
      const priorite = { correct: 3, present: 2, absent: 1 };
      motEnCours.forEach((lettre, i) => {
        const etat = resultat.evaluation[i];
        if (!nouvStatut[lettre] || priorite[etat] > priorite[nouvStatut[lettre]]) {
          nouvStatut[lettre] = etat;
        }
      });

      let nouvEtat = 'en_cours';
      let nouvMotCible = motCible;

      if (resultat.gagne) {
        nouvEtat = 'gagne';
        nouvMotCible = resultat.motCible;
      } else if (nouvTentatives.length >= MAX_ESSAIS) {
        try {
          const abandon = await abandonner(playerIdRef.current, nouvTentatives.length);
          nouvMotCible = abandon.motCible;
        } catch (_) {}
        nouvEtat = 'perdu';
      }

      setTentatives(nouvTentatives);
      setLettresStatut(nouvStatut);
      setEtatPartie(nouvEtat);
      setMotCible(nouvMotCible);
      setMotEnCours([premiereLettre]);
      await sauvegarder(nouvTentatives, nouvStatut, nouvEtat, nouvMotCible);
    } catch (err) {
      setMessageErreur(err.message || 'Erreur lors de la validation.');
    }
  }, [etatPartie, motEnCours, longueurMot, tentatives, lettresStatut, premiereLettre, dateDuJour, motCible]);

  return {
    chargement, erreurReseau,
    dateDuJour, longueurMot, premiereLettre, motCible,
    tentatives, motEnCours, etatPartie,
    messageErreur, lettresStatut,
    essaisRestants: MAX_ESSAIS - tentatives.length,
    maxEssais: MAX_ESSAIS,
    peutValider: motEnCours.length === longueurMot && etatPartie === 'en_cours',
    appuyerLettre, effacerLettre, validerTentative,
    reinitialiser: initialiser,
  };
}