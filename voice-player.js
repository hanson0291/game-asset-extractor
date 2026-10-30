import { characters, initialCharacterId } from './characters.js';
const find = selector => document.querySelector(selector);
let character = characters.find(item => item.id === initialCharacterId()) || characters[0];
let base = character.audio;
const audio = find('#voice-audio');
let tracks = [], filtered = [], selected = null, limit = 30, request = 0, libraryRequest = 0;
let lowVoice = false;
try { lowVoice = localStorage.getItem(character.id + '-low-voice') === 'true'; } catch {}
audio.volume = 0.7;
const languageName = value => ({en:'English',ru:'Russian',sfx:'Cat sounds'})[value] || value;
const time = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2,'0')}`;

// Terminal.ApplySlothMod in the game sets both Mom and Andrew to 0.75.
// Unity's AudioSource.pitch changes both pitch and speed. Disable browser
// pitch preservation so playbackRate reproduces that behavior.
function applyVoiceMode() {
  audio.preservesPitch = false;
  if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = false;
  if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = false;
  audio.defaultPlaybackRate = audio.playbackRate = lowVoice ? 0.75 : 1;
  find('#voice-heading').textContent = character.name.toUpperCase() + "'S VOICE";
  find('#voice-low').textContent = character.name + ' with low voice';
  find('.voice-presets').setAttribute('aria-label',character.name + ' voice version');
  audio.setAttribute('aria-label',character.name + ' voice clip player');
  find('#voice-list').setAttribute('aria-label',character.name + ' voice clips');
  find('#voice-low').setAttribute('aria-pressed',String(lowVoice));
  find('#voice-original').setAttribute('aria-pressed',String(!lowVoice));
  find('#voice-mode').textContent = lowVoice
    ? 'Low voice · 0.75× pitch and speed'+(character.gameId==='schoolboy-runaway'?' · game’s sloth-mode setting':' · pitch preview')
    : 'Original voice · 1.00× pitch and speed';
}

function chooseVoiceMode(value) {
  lowVoice = value;
  try { localStorage.setItem(character.id + '-low-voice',String(value)); } catch {}
  applyVoiceMode();
  const track = selected || filtered[0] || tracks[0];
  if (track) playTrack(track);
}

find('#voice-low').onclick = () => chooseVoiceMode(true);
find('#voice-original').onclick = () => chooseVoiceMode(false);
audio.addEventListener('loadedmetadata',applyVoiceMode);
applyVoiceMode();

function updateNavigation() {
  const index = filtered.findIndex(track => track.id === selected?.id);
  find('#voice-prev').disabled = index <= 0;
  find('#voice-next').disabled = !filtered.length || index === filtered.length - 1;
}

function renderList() {
  const language = find('#voice-language').value;
  const search = find('#voice-search').value.trim().toLowerCase();
  filtered = tracks.filter(track => (language === 'all' || track.language === language) && `${track.number} ${track.title} ${track.original_name}`.toLowerCase().includes(search));
  find('#voice-count').textContent = `${filtered.length} / ${tracks.length}`;
  const list = find('#voice-list');
  list.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No clips match. Try another search or language.';
    list.append(empty);
  }
  filtered.slice(0,limit).forEach(track => {
    const button = document.createElement('button');
    button.className = 'voice-track' + (selected?.id === track.id ? ' selected' : '');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(selected?.id === track.id));
    button.setAttribute('aria-label', `Play ${character.name} ${languageName(track.language)} line ${track.number}: ${track.title}`);
    const icon = document.createElement('span');
    icon.className = 'voice-play-icon';
    icon.textContent = selected?.id === track.id && !audio.paused ? 'Ⅱ' : '▶';
    const content = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = track.title;
    const meta = document.createElement('small');
    meta.textContent = `#${track.number} · ${languageName(track.language)} · ${time(track.duration)}`;
    content.append(title,meta);
    button.append(icon,content);
    button.onclick = () => {
      if (selected?.id === track.id && !audio.paused) audio.pause();
      else playTrack(track);
    };
    list.append(button);
  });
  find('#voice-more').hidden = filtered.length <= limit;
  updateNavigation();
}

async function playTrack(track) {
  const currentRequest = ++request;
  audio.hidden = false;
  if (selected?.id !== track.id) {
    audio.pause();
    selected = track;
    audio.src = base + encodeURIComponent(track.file);
    find('#voice-title').textContent = track.title;
    find('#voice-meta').textContent = `Line ${track.number} · ${languageName(track.language)} · ${time(track.duration)}`;
    const download = find('#voice-download');
    download.href = audio.src;
    download.download = track.file;
    download.hidden = false;
  }
  applyVoiceMode();
  find('#voice-status').textContent = `Loading line ${track.number}…`;
  renderList();
  try {
    await audio.play();
    if (request === currentRequest) find('#voice-status').textContent = `Playing ${languageName(track.language)} line ${track.number}${lowVoice ? ' · low voice' : ''}.`;
  } catch (error) {
    if (request === currentRequest && error.name !== 'AbortError') find('#voice-status').textContent = 'Playback could not start. Try the audio player’s Play button.';
  }
}

find('#voice-language').onchange = find('#voice-search').oninput = () => { limit = 30; renderList(); };
find('#voice-more').onclick = () => { limit += 30; renderList(); };
find('#voice-prev').onclick = () => {
  const index = filtered.findIndex(track => track.id === selected?.id);
  if (index > 0) playTrack(filtered[index - 1]);
};
find('#voice-next').onclick = () => {
  const index = filtered.findIndex(track => track.id === selected?.id);
  if (index + 1 < filtered.length) playTrack(filtered[index + 1]);
};
audio.addEventListener('play', () => { renderList(); if (selected) find('#voice-status').textContent = `Playing ${languageName(selected.language)} line ${selected.number}${lowVoice ? ' · low voice' : ''}.`; });
audio.addEventListener('pause', () => { renderList(); if (selected && !audio.ended) find('#voice-status').textContent = `Paused line ${selected.number}.`; });
audio.addEventListener('ended', () => { renderList(); find('#voice-status').textContent = 'Clip finished. Choose another clip or press Next.'; });
audio.addEventListener('error', () => { find('#voice-status').textContent = 'This clip could not be loaded. Try another clip.'; });

async function loadLibrary(id = character.id) {
  const next = characters.find(item => item.id === id);
  if (!next) return;
  if (next.id === character.id && tracks.length) return;
  const currentLibraryRequest = ++libraryRequest;
  ++request;
  selected = null;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  audio.hidden = true;
  character = next;
  base = character.audio;
  lowVoice = false;
  try { lowVoice = localStorage.getItem(character.id + '-low-voice') === 'true'; } catch {}
  tracks = [];
  filtered = [];
  limit = 30;
  find('#voice-search').value = '';
  find('#voice-language').disabled = find('#voice-search').disabled = true;
  find('#voice-low').disabled = find('#voice-original').disabled = true;
  find('#voice-title').textContent = 'Select a voice clip';
  find('#voice-meta').textContent = character.name + ' · extracted voice library';
  find('#voice-download').hidden = true;
  find('#voice-status').textContent = 'Loading ' + character.name + ' voice library…';
  renderList();
  applyVoiceMode();
  if (!base) {
    find('#voice-count').textContent = '0 clips';
    find('#voice-title').textContent = 'No extracted voice clips';
    find('#voice-status').textContent = 'Voice audio has not been extracted for ' + character.name + '.';
    return;
  }
  try {
    const response = await fetch(base + 'manifest.json');
    if (!response.ok) throw new Error('Voice manifest unavailable');
    const manifest = await response.json();
    if (currentLibraryRequest !== libraryRequest) return;
    tracks = manifest.tracks;
    if (!Array.isArray(tracks) || !tracks.length) throw new Error('No extracted clips available');
    find('#voice-language').value = tracks.some(track => track.language === 'en') ? 'en' : 'all';
    find('#voice-language').disabled = find('#voice-search').disabled = false;
    find('#voice-low').disabled = find('#voice-original').disabled = false;
    find('#voice-status').textContent = `${tracks.length} extracted ${character.name} voice clips. Select one to listen.`;
    renderList();
  } catch (error) {
    if (currentLibraryRequest !== libraryRequest) return;
    find('#voice-count').textContent = 'Unavailable';
    find('#voice-status').textContent = 'Voice library could not load. Refresh after extraction finishes.';
  }
}
window.addEventListener('character-selected', event => loadLibrary(event.detail.id));
loadLibrary();
