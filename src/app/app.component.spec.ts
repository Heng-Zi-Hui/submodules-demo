import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('loads the links table', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    httpTesting.expectOne('http://localhost:3000/api/links').flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No links yet.');
  });

  it('rejects invalid URLs without submitting', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    httpTesting.expectOne('http://localhost:3000/api/links').flush([]);

    const component = fixture.componentInstance;
    component.form.controls.url.setValue('ftp://example.com');
    component.submit();

    expect(component.form.controls.url.invalid).toBeTrue();
    httpTesting.expectNone(request => request.method === 'POST');
  });

  it('creates a link and refreshes the table', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    httpTesting.expectOne('http://localhost:3000/api/links').flush([]);

    const component = fixture.componentInstance;
    component.form.controls.url.setValue('https://example.com/article');
    component.submit();

    httpTesting.expectOne(request =>
      request.method === 'POST' &&
      request.url === 'http://localhost:3000/api/links'
    ).flush({
      code: 'a1b2c3',
      url: 'https://example.com/article',
      shortUrl: 'http://localhost:3000/a1b2c3',
      hits: 0,
      createdAt: '2026-11-12T00:00:00.000Z'
    });

    httpTesting.expectOne('http://localhost:3000/api/links').flush([{
      code: 'a1b2c3',
      url: 'https://example.com/article',
      shortUrl: 'http://localhost:3000/a1b2c3',
      hits: 0,
      createdAt: '2026-11-12T00:00:00.000Z'
    }]);

    expect(component.links()).toHaveSize(1);
    expect(component.createdLink()?.shortUrl).toBe('http://localhost:3000/a1b2c3');
  });

  it('shows API validation errors inline', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    httpTesting.expectOne('http://localhost:3000/api/links').flush([]);

    const component = fixture.componentInstance;
    component.form.controls.url.setValue('https://example.com');
    component.submit();

    httpTesting.expectOne(request => request.method === 'POST').flush(
      { error: 'URL is invalid' },
      { status: 400, statusText: 'Bad Request' }
    );
    fixture.detectChanges();

    expect(component.submitError()).toBe('URL is invalid');
    expect(fixture.nativeElement.textContent).toContain('URL is invalid');
  });
});
