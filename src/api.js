const API_BASE_URL = 'https://api.nour-aqad.uk/api';

const DEFAULT_TIMEOUT = 8000;

async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Erreur HTTP ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error('Délai de connexion dépassé. Vérifiez votre connexion.');
    }
    throw err;
  }
}

export async function getInfoJeu() {
  return fetchWithTimeout(`${API_BASE_URL}/info`);
}

export async function soumettreTentative(tentative, playerId) {
  return fetchWithTimeout(`${API_BASE_URL}/tentative`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tentative, playerId })
  });
}

export async function abandonner(playerId, essaisUtilises) {
  return fetchWithTimeout(`${API_BASE_URL}/abandon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, essaisUtilises })
  });
}
