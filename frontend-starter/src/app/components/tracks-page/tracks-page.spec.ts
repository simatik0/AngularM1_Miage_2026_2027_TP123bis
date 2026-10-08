import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authInterceptor } from '../../shared/interceptors/auth.interceptor';
import { Track } from '../../shared/models/track.model';
import { AuthService } from '../../shared/services/auth.service';
import { TracksPageComponent } from './tracks-page';

describe('Bibliothèque TD2 (API simulée)', () => {
  let fixture: ComponentFixture<TracksPageComponent>;
  let component: TracksPageComponent;
  let http: HttpTestingController;
  const track: Track = {
    id: 'track-1', title: 'Blues', originalName: 'blues.mp3',
    mimeType: 'audio/mpeg', size: 2048, createdAt: '2026-10-07T12:00:00Z',
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
      imports: [TracksPageComponent],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigateByUrl: vi.fn().mockResolvedValue(true) } },
      ],
    });
    TestBed.inject(AuthService).token.set('synthetic-test-token');
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TracksPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
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
    expect(fixture.nativeElement.textContent).not.toContain('Blues');
    component.go(3);
    http.expectNone(request => request.url === '/api/tracks');
    expect(component.page()).toBe(2);
  });

  it('montre l’état vide sans télécharger de fichiers audio', () => {
    list(1, 1, []);
    expect(fixture.nativeElement.textContent).toContain('Aucune piste');
    const buttons = fixture.nativeElement.querySelectorAll('.pager button') as NodeListOf<HTMLButtonElement>;
    expect([...buttons].every(button => button.disabled)).toBe(true);
    http.expectNone(request => request.url.endsWith('/audio'));
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

  it('envoie exactement audio et title, évite un double POST et réinitialise le formulaire puis la première page', () => {
    list(1, 2);
    component.go(2);
    list(2, 2);
    choose();
    component.title.setValue('  Mon blues  ');
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    const submit = new Event('submit', { cancelable: true });
    form.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('#audio-file').disabled).toBe(true);
    expect(component.title.disabled).toBe(true);
    const request = http.expectOne('/api/tracks');
    const body = request.request.body as FormData;
    const keys: string[] = [];
    body.forEach((_value, key) => keys.push(key));
    expect(keys).toEqual(['audio', 'title']);
    expect(body.get('audio')).toBeInstanceOf(File);
    expect(body.get('title')).toBe('Mon blues');
    expect(request.request.headers.has('Content-Type')).toBe(false);
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

  it('conserve le fichier après un 400 serveur et utilise son nom quand le titre est vide', () => {
    list();
    choose();
    component.title.setValue('   ');
    component.upload();
    const request = http.expectOne('/api/tracks');
    expect(request.request.body.get('title')).toBe('blues.mp3');
    request.flush({ message: 'Format audio non accepté' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Format audio non accepté');
    expect(component.file()).not.toBeNull();
    expect(component.uploading()).toBe(false);
    component.upload();
    http.expectOne('/api/tracks').flush({ message: 'File too large' }, { status: 400, statusText: 'Bad Request' });
    expect(component.uploadError()).toContain('25 Mo');
  });

  it('charge un Blob authentifié au clic et révoque les URL au remplacement et à la destruction', () => {
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
    fixture.destroy();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:audio-2');
  });

  it('annule un ancien téléchargement et le téléchargement en cours à la destruction', () => {
    list();
    component.play(track);
    const first = http.expectOne('/api/tracks/track-1/audio');
    component.play({ ...track, id: 'track-2' });
    expect(first.cancelled).toBe(true);
    const second = http.expectOne('/api/tracks/track-2/audio');
    fixture.destroy();
    expect(second.cancelled).toBe(true);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('affiche un refus audio 404 et une erreur de décodage du lecteur', () => {
    list();
    component.play(track);
    http.expectOne('/api/tracks/track-1/audio').flush(new Blob(['{"message":"Piste inconnue"}']), { status: 404, statusText: 'Not Found' });
    expect(component.audioError()).toContain('ne vous appartient pas');
    expect(component.audioLoading()).toBe(false);
    component.play(track);
    http.expectOne('/api/tracks/track-1/audio').flush(new Blob(['audio']));
    fixture.detectChanges();
    const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
    expect(audio.getAttribute('src')).toBe('blob:audio-1');
    audio.dispatchEvent(new Event('error'));
    expect(component.audioError()).toContain('ne peut pas lire');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:audio-1');
    expect(component.audioUrl()).toBe('');
  });
});
