import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpEventType, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authInterceptor } from '../../shared/interceptors/auth.interceptor';
import { Track } from '../../shared/models/track.model';
import { AuthService } from '../../shared/services/auth.service';
import { AudioPlaybackService } from '../../shared/services/audio-playback.service';
import { AudioAnalysisService } from '../../shared/services/audio-analysis.service';
import { AudioPlayerComponent } from '../audio-player/audio-player';
import { TracksPageComponent } from './tracks-page';

describe('Bibliothèque TD2 et TD3 (API simulée)', () => {
  let fixture: ComponentFixture<TracksPageComponent>;
  let component: TracksPageComponent;
  let http: HttpTestingController;
  let playback: AudioPlaybackService;
  const track: Track = {
    id: 'track-1', title: 'Blues', originalName: 'blues.mp3',
    mimeType: 'audio/mpeg', size: 2048, createdAt: '2026-10-07T12:00:00Z',
    bpm: 120, key: 'La mineur', tuning: 'E standard', genre: 'Blues', level: 'debutant',
    waveform: Array.from({ length: 128 }, (_, index) => (index % 9) / 9),
  };
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    createObjectURL.mockReset().mockReturnValue('blob:audio-1');
    revokeObjectURL.mockReset();
    // jsdom ne fournit pas ces deux méthodes du navigateur.
    vi.stubGlobal('URL', class extends URL {
      static override createObjectURL = createObjectURL;
      static override revokeObjectURL = revokeObjectURL;
    });

    TestBed.configureTestingModule({
      imports: [TracksPageComponent, AudioPlayerComponent],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AudioAnalysisService,
          useValue: {
            analyze: vi.fn().mockResolvedValue({
              bpm: 110,
              key: 'Mi mineur',
              waveform: Array.from({ length: 128 }, (_, index) => (index % 8) / 8),
            }),
          },
        },
        { provide: Router, useValue: { navigateByUrl: vi.fn().mockResolvedValue(true) } },
      ],
    });
    TestBed.inject(AuthService).token.set('synthetic-test-token');
    playback = TestBed.inject(AudioPlaybackService);
    playback.stop();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TracksPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne('/api/playlists').flush([]);
  });

  afterEach(() => {
    fixture.destroy();
    playback.stop();
    http.verify();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function list(page = 1, pages = 1, items: Track[] = [track]): void {
    const request = http.expectOne(`/api/tracks?page=${page}&limit=5`);
    expect(request.request.method).toBe('GET');
    request.flush({ items, page, limit: 5, total: items.length, pages });
    fixture.detectChanges();
  }

  function choose(file = new File(['audio'], 'blues.mp3', { type: 'audio/mpeg' })): void {
    const input = fixture.nativeElement.querySelector('#audio-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('demande chaque page au serveur et bloque les bornes et les clics pendant le chargement', () => {
    expect(fixture.nativeElement.textContent).toContain('Chargement des pistes');
    expect(fixture.nativeElement.textContent).not.toContain('Aucune piste');
    list(1, 2);
    component.go(0);
    component.go(1);
    http.expectNone(request => request.url === '/api/tracks');
    component.go(2);
    component.go(2);
    list(2, 2, [{ ...track, id: 'track-2', title: 'Jazz' }]);
    expect(fixture.nativeElement.textContent).toContain('Jazz');
    expect(fixture.nativeElement.querySelector('#track-track-1')).toBeNull();
    component.go(3);
    http.expectNone(request => request.url === '/api/tracks');
    expect(component.page()).toBe(2);
  });

  it('filtre et trie les pistes selon le format et le BPM affiché', () => {
    const wavTrack: Track = {
      ...track, id: 'track-2', title: 'Jazz', mimeType: 'audio/x-wav',
      bpm: 90, createdAt: '2026-10-08T08:00:00Z',
    };
    list(1, 1, [track, wavTrack]);
    component.formatFilter.set('WAV');
    component.sortOrder.set('bpm');
    expect(component.visibleTracks().map((item) => item.id)).toEqual(['track-2']);
    component.formatFilter.set('');
    component.bpmMinFilter.set('100');
    component.keyFilter.set('la mineur');
    expect(component.visibleTracks().map((item) => item.id)).toEqual(['track-1']);
    component.bpmMinFilter.set('');
    component.keyFilter.set('');
    expect(component.visibleTracks().map((item) => item.bpm)).toEqual([90, 120]);
    expect(fixture.nativeElement.textContent).toContain('120');
  });

  it('enregistre manuellement le BPM et les informations musicales', () => {
    list();
    component.editMetadata(track);
    component.metadataForm.setValue({
      bpm: 135, key: 'Mi mineur', tuning: 'Drop D', genre: 'Rock', level: 'intermediaire',
    });
    component.saveMetadata(track);
    const request = http.expectOne('/api/tracks/track-1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      bpm: 135, key: 'Mi mineur', tuning: 'Drop D', genre: 'Rock', level: 'intermediaire',
    });
    request.flush({ ...track, bpm: 135, key: 'Mi mineur', tuning: 'Drop D', genre: 'Rock', level: 'intermediaire' });
    expect(component.tracks()[0].bpm).toBe(135);
    expect(component.metadataEditTrackId()).toBeNull();
  });

  it('crée une playlist depuis le menu contextuel et y ajoute automatiquement la piste', () => {
    list();
    const row = fixture.nativeElement.querySelector('.track-row') as HTMLElement;
    const contextMenu = new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: 50, clientY: 60,
    });
    row.dispatchEvent(contextMenu);
    fixture.detectChanges();
    const submenu = fixture.nativeElement.querySelector('.playlist-submenu summary') as HTMLElement;
    submenu.click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.create-playlist-option') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#new-playlist-name') as HTMLInputElement;
    input.value = 'Répétition';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const form = fixture.nativeElement.querySelector('.playlist-dialog form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const create = http.expectOne('/api/playlists');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ name: 'Répétition' });
    create.flush({ id: 'playlist-1', name: 'Répétition', trackIds: [], createdAt: track.createdAt });
    const add = http.expectOne('/api/playlists/playlist-1/tracks');
    expect(add.request.body).toEqual({ trackId: track.id, action: 'add' });
    add.flush({
      id: 'playlist-1', name: 'Répétition', trackIds: [track.id], createdAt: track.createdAt,
    });
    fixture.detectChanges();
    expect(component.playlists()[0].trackIds).toEqual([track.id]);
    expect(component.playlistDialogOpen()).toBe(false);
  });

  it('ajoute une piste à la file et enchaîne automatiquement', () => {
    list();
    component.enqueue(track);
    expect(component.queue()).toEqual([track]);
    playback.onEnded();
    expect(component.queue()).toEqual([]);
    const request = http.expectOne('/api/tracks/track-1/audio');
    request.flush(new Blob(['audio'], { type: 'audio/mpeg' }));
    expect(component.currentTrack()?.id).toBe(track.id);
  });

  it('montre l’état vide sans télécharger de fichiers audio', () => {
    list(1, 1, []);
    expect(fixture.nativeElement.textContent).toContain('Aucune piste');
    const buttons = fixture.nativeElement.querySelectorAll('.pager button') as NodeListOf<HTMLButtonElement>;
    expect([...buttons].every(button => button.disabled)).toBe(true);
    http.expectNone(request => request.url.endsWith('/audio'));
  });

  it('recherche les pistes affichées et filtre les favoris', () => {
    list(1, 1, [track, { ...track, id: 'track-2', title: 'Jazz', originalName: 'jazz.wav' }]);
    component.setSearchQuery({ target: { value: 'jazz' } } as unknown as Event);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Jazz');
    expect(fixture.nativeElement.textContent).not.toContain('blues.mp3');

    component.setSearchQuery({ target: { value: '' } } as unknown as Event);
    component.toggleFavorite('track-1');
    component.toggleFavoritesFilter();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Blues');
    expect(fixture.nativeElement.textContent).not.toContain('Jazz');
  });

  it('présente les filtres dans un menu discret à côté de la recherche', () => {
    list();
    fixture.detectChanges();

    const filterMenu = fixture.nativeElement.querySelector('.filter-menu') as HTMLDetailsElement;
    expect(filterMenu.open).toBe(false);
    expect(fixture.nativeElement.querySelector('.filter-tools')).toBeNull();

    (filterMenu.querySelector('summary') as HTMLElement).click();
    fixture.detectChanges();
    const filterPanel = filterMenu.querySelector('.filter-menu__panel') as HTMLElement;
    expect(filterMenu.open).toBe(true);
    expect(filterPanel.textContent).toContain('Date d’ajout');
    expect(filterPanel.textContent).toContain('BPM minimum');
    expect(filterPanel.querySelector('.favorites-filter')).not.toBeNull();
  });

  it('demande confirmation avant de supprimer le fichier et sa piste puis actualise la page', () => {
    list();
    const row = fixture.nativeElement.querySelector('.track-row') as HTMLElement;
    row.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: 50, clientY: 60,
    }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.track-row__queue')).toBeNull();
    const menuDelete = fixture.nativeElement.querySelector('.track-menu-delete') as HTMLButtonElement;
    expect(menuDelete).not.toBeNull();
    expect(menuDelete.parentElement?.lastElementChild).toBe(menuDelete);
    expect(menuDelete.textContent).toContain('Supprimer');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    menuDelete.click();
    http.expectNone(request => request.method === 'DELETE');

    confirm.mockReturnValue(true);
    component.delete(track);
    const request = http.expectOne('/api/tracks/track-1');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.headers.get('Authorization')).toBe('Bearer synthetic-test-token');
    request.flush(null);
    list();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('ont été supprimés');
    expect(fixture.nativeElement.querySelector('.snack-bar[role="status"]')).not.toBeNull();
    expect(component.deletingTrackId()).toBeNull();
    fixture.nativeElement.querySelector('.snack-bar button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.snack-bar')).toBeNull();
  });

  it('traite une suppression devenue obsolète comme une actualisation, sans laisser la piste dans la liste', () => {
    list(1, 2);
    component.go(2);
    list(2, 2, [track]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.delete(track);
    http.expectOne('/api/tracks/track-1').flush(
      { message: 'Piste inconnue' },
      { status: 404, statusText: 'Not Found' },
    );
    list(1, 1, [{ ...track, id: 'track-2', title: 'Jazz' }]);
    fixture.detectChanges();

    expect(component.tracks()[0].title).toBe('Jazz');
    expect(component.page()).toBe(1);
    expect(component.deleteSuccess()).toContain('n’est plus disponible');
    expect(fixture.nativeElement.querySelector('.snack-bar[role="status"]')).not.toBeNull();
  });

  it('signale une erreur serveur de suppression sans retirer localement la piste', () => {
    list();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.delete(track);
    http.expectOne('/api/tracks/track-1').flush(
      { message: 'Suppression impossible' },
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();

    expect(component.tracks()).toEqual([track]);
    expect(component.deleteError()).toBe('Suppression impossible');
    expect(fixture.nativeElement.querySelector('.snack-bar[role="alert"]')).not.toBeNull();
    http.expectNone(request => request.url === '/api/tracks?page=1&limit=5');
  });

  it('permet de naviguer dans la piste avec la barre de progression et affiche le temps', () => {
    list();
    component.play(track);
    http.expectOne('/api/tracks/track-1/audio').flush(new Blob(['audio'], { type: 'audio/mpeg' }));
    const playerFixture = TestBed.createComponent(AudioPlayerComponent);
    playerFixture.detectChanges();

    const audio = playerFixture.nativeElement.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'duration', { value: 120, configurable: true });
    Object.defineProperty(audio, 'currentTime', { value: 0, writable: true, configurable: true });
    audio.dispatchEvent(new Event('loadedmetadata'));
    fixture.detectChanges();
    const seekbar = playerFixture.nativeElement.querySelector('.player-seek input') as HTMLInputElement;
    seekbar.value = '45';
    seekbar.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(audio.currentTime).toBe(45);
    expect(component.currentTime()).toBe(45);
    expect(component.duration()).toBe(120);
    expect(component.progressPercent()).toBe(37.5);
    expect(playback.formatTime(45)).toBe('0:45');
    expect(playback.formatTime(120)).toBe('2:00');
    playerFixture.destroy();
  });

  it('démarre la lecture lorsque le fichier audio chargé devient lisible', () => {
    list();
    component.play(track);
    http.expectOne('/api/tracks/track-1/audio').flush(new Blob(['audio'], { type: 'audio/mpeg' }));
    const playerFixture = TestBed.createComponent(AudioPlayerComponent);
    playerFixture.detectChanges();

    const audio = playerFixture.nativeElement.querySelector('audio') as HTMLAudioElement;
    const playAudio = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(audio, 'play', { configurable: true, value: playAudio });
    audio.dispatchEvent(new Event('canplay'));
    audio.dispatchEvent(new Event('canplay'));

    expect(playAudio).toHaveBeenCalledOnce();
    playerFixture.destroy();
  });

  it('garde la forme d’onde masquée et regroupe la file dans le lecteur flottant', () => {
    list();
    component.play(track);
    http.expectOne('/api/tracks/track-1/audio').flush(new Blob(['audio'], { type: 'audio/mpeg' }));
    playback.enqueue({ ...track, id: 'track-2', title: 'Jazz' });
    const playerFixture = TestBed.createComponent(AudioPlayerComponent);
    playerFixture.detectChanges();

    expect(playerFixture.nativeElement.querySelector('.waveform')).toBeNull();
    expect(playerFixture.nativeElement.querySelector('.player-tool').textContent).toContain('Forme d’onde');
    const player = playerFixture.componentInstance;
    player.waveform.set([35, 50, 75]);
    playback.duration.set(120);
    playback.currentTime.set(45);
    (playerFixture.nativeElement.querySelector('.player-tool') as HTMLButtonElement).click();
    playerFixture.detectChanges();
    expect(playerFixture.nativeElement.querySelector('.waveform-playhead').style.left).toBe('37.5%');

    const queueMenu = playerFixture.nativeElement.querySelector('.queue-menu') as HTMLDetailsElement;
    expect(queueMenu.open).toBe(false);
    (queueMenu.querySelector('summary') as HTMLElement).click();
    playerFixture.detectChanges();
    expect(queueMenu.open).toBe(true);
    expect((queueMenu.querySelector('summary') as HTMLElement).textContent).toContain('File d’attente (1)');
    expect(queueMenu.textContent).toContain('Jazz');
    playerFixture.destroy();
  });

  it('affiche une erreur de liste et permet de réessayer sans changer la page affichée', () => {
    list(1, 2);
    component.go(2);
    http.expectOne('/api/tracks?page=2&limit=5').flush({}, { status: 500, statusText: 'Server error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Impossible de charger');
    expect(component.loading()).toBe(false);
    expect(component.page()).toBe(1);
    component.go(2);
    list(2, 2);
    expect(component.listError()).toBe('');
  });

  it('refuse un fichier absent, vide, au mauvais format ou supérieur à 25 Mo avant tout POST', () => {
    list();
    component.upload();
    expect(component.uploadError()).toContain('Choisissez');
    choose(new File(['texte'], 'notes.txt', { type: 'text/plain' }));
    component.upload();
    expect(component.uploadError()).toContain('Format non accepté');
    choose(new File([], 'vide.mp3', { type: 'audio/mpeg' }));
    component.upload();
    expect(component.uploadError()).toContain('vide');
    const tooLarge = new File(['audio'], 'grand.mp3', { type: 'audio/mpeg' });
    Object.defineProperty(tooLarge, 'size', { value: 25 * 1024 * 1024 + 1 });
    choose(tooLarge);
    component.upload();
    expect(component.uploadError()).toContain('25 Mo');
    http.expectNone(request => request.method === 'POST');
  });

  it('analyse le morceau automatiquement, envoie les résultats puis réinitialise le formulaire et la première page', async () => {
    list(1, 2);
    component.go(2);
    list(2, 2);
    choose();
    component.title.setValue('  Mon blues  ');
    expect(fixture.nativeElement.textContent).not.toContain('Informations musicales (facultatif)');
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    const submit = new Event('submit', { cancelable: true });
    form.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('#audio-file').disabled).toBe(true);
    expect(component.title.disabled).toBe(true);
    await vi.waitFor(() => expect(component.analysisStatus()).toContain('envoi'));
    await component.upload();
    const request = http.expectOne('/api/tracks');
    const body = request.request.body as FormData;
    const keys: string[] = [];
    body.forEach((_value, key) => keys.push(key));
    expect(keys).toEqual(['audio', 'title', 'bpm', 'key', 'tuning', 'genre', 'level', 'waveform']);
    expect(body.get('audio')).toBeInstanceOf(File);
    expect(body.get('title')).toBe('Mon blues');
    expect(body.get('bpm')).toBe('110');
    expect(body.get('key')).toBe('Mi mineur');
    expect(body.get('genre')).toBe('');
    expect(JSON.parse(String(body.get('waveform')))).toHaveLength(128);
    expect(request.request.headers.has('Content-Type')).toBe(false);
    expect(request.request.reportProgress).toBe(true);
    request.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
    fixture.detectChanges();
    expect(component.uploadProgress()).toBe(50);
    expect(fixture.nativeElement.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('50');
    expect(fixture.nativeElement.querySelector('[role="progressbar"] span').style.width).toBe('50%');
    request.flush({ ...track, title: 'Mon blues' });
    list();
    expect(component.page()).toBe(1);
    expect(component.file()).toBeNull();
    expect(component.title.value).toBe('');
    expect(fixture.nativeElement.querySelector('#audio-file').value).toBe('');
    expect(component.uploading()).toBe(false);
    expect(component.title.enabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('a bien été ajouté');
  });

  it('conserve le fichier après un 400 serveur et utilise son nom quand le titre est vide', async () => {
    list();
    choose();
    component.title.setValue('   ');
    component.upload();
    await vi.waitFor(() => expect(component.analysisStatus()).toContain('envoi'));
    const request = http.expectOne('/api/tracks');
    expect(request.request.body.get('title')).toBe('blues.mp3');
    request.flush({ message: 'Format audio non accepté' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Format audio non accepté');
    expect(component.file()).not.toBeNull();
    expect(component.uploading()).toBe(false);
    component.upload();
    await vi.waitFor(() => expect(component.analysisStatus()).toContain('envoi'));
    http.expectOne('/api/tracks').flush({ message: 'File too large' }, { status: 400, statusText: 'Bad Request' });
    expect(component.uploadError()).toContain('25 Mo');
  });

  it('charge un Blob authentifié et conserve la lecture après la destruction de la page bibliothèque', () => {
    list();
    http.expectNone(request => request.url.endsWith('/audio'));
    component.play(track);
    const request = http.expectOne('/api/tracks/track-1/audio');
    expect(request.request.responseType).toBe('blob');
    expect(request.request.headers.get('Authorization')).toBe('Bearer synthetic-test-token');
    request.flush(new Blob(['audio'], { type: 'audio/mpeg' }));
    expect(component.audioUrl()).toBe('blob:audio-1');
    createObjectURL.mockReturnValue('blob:audio-2');
    component.play({ ...track, id: 'track-2' });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:audio-1');
    http.expectOne('/api/tracks/track-2/audio').flush(new Blob(['audio']));
    const playerFixture = TestBed.createComponent(AudioPlayerComponent);
    playerFixture.detectChanges();
    const audio = playerFixture.nativeElement.querySelector('audio') as HTMLAudioElement;
    const playAudio = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(audio, 'play', { configurable: true, value: playAudio });
    audio.dispatchEvent(new Event('canplay'));
    audio.dispatchEvent(new Event('play'));
    playerFixture.detectChanges();
    fixture.destroy();
    expect(component.currentTrack()?.id).toBe('track-2');
    expect(component.audioUrl()).toBe('blob:audio-2');
    expect(component.isPlaying()).toBe(true);
    expect(playerFixture.nativeElement.querySelector('audio')).not.toBeNull();
    expect(playAudio).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:audio-2');
    playback.stop();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:audio-2');
    playerFixture.destroy();
  });

  it('annule le téléchargement remplacé mais conserve le téléchargement en cours après navigation', () => {
    list();
    component.play(track);
    const first = http.expectOne('/api/tracks/track-1/audio');
    component.play({ ...track, id: 'track-2' });
    expect(first.cancelled).toBe(true);
    const second = http.expectOne('/api/tracks/track-2/audio');
    fixture.destroy();
    expect(second.cancelled).toBe(false);
    second.flush(new Blob(['audio']));
    expect(createObjectURL).toHaveBeenCalledOnce();
  });

  it('affiche un refus audio 404 et une erreur de décodage du lecteur', () => {
    list();
    component.play(track);
    http.expectOne('/api/tracks/track-1/audio').flush(new Blob(['{"message":"Piste inconnue"}']), { status: 404, statusText: 'Not Found' });
    expect(component.audioError()).toContain('ne vous appartient pas');
    expect(component.audioLoading()).toBe(false);
    component.play(track);
    http.expectOne('/api/tracks/track-1/audio').flush(new Blob(['audio']));
    const playerFixture = TestBed.createComponent(AudioPlayerComponent);
    playerFixture.detectChanges();
    const audio = playerFixture.nativeElement.querySelector('audio') as HTMLAudioElement;
    expect(audio.getAttribute('src')).toBe('blob:audio-1');
    audio.dispatchEvent(new Event('error'));
    expect(component.audioError()).toContain('ne peut pas lire');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:audio-1');
    expect(component.audioUrl()).toBe('');
    playerFixture.destroy();
  });

  it('affiche le diagnostic détaillé de l’API quand le fichier audio local est absent', async () => {
    list();
    component.play(track);
    http.expectOne('/api/tracks/track-1/audio').flush(
      new Blob(['{"message":"Fichier audio indisponible ; réimportez cette piste"}'], {
        type: 'application/json',
      }),
      { status: 404, statusText: 'Not Found' },
    );

    await vi.waitFor(() => {
      expect(component.audioError()).toBe('Fichier audio indisponible ; réimportez cette piste');
    });
  });
});
