import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { LinkRecord, LinksApiService } from './links-api.service';

const httpUrlValidator: ValidatorFn = (control): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? null
      : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  private readonly linksApi = inject(LinksApiService);

  readonly form = new FormGroup({
    url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, httpUrlValidator]
    })
  });
  readonly links = signal<LinkRecord[]>([]);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly listError = signal('');
  readonly submitError = signal('');
  readonly createdLink = signal<LinkRecord | null>(null);

  ngOnInit(): void {
    this.loadLinks();
  }

  get urlControl(): FormControl<string> {
    return this.form.controls.url;
  }

  submit(): void {
    if (this.submitting() || this.form.invalid) {
      this.urlControl.markAsTouched();
      return;
    }

    this.submitError.set('');
    this.createdLink.set(null);
    this.submitting.set(true);

    this.linksApi.createLink(this.urlControl.value.trim()).subscribe({
      next: (link) => {
        this.createdLink.set(link);
        this.form.reset();
        this.submitting.set(false);
        this.loadLinks();
      },
      error: (error: unknown) => {
        this.submitError.set(this.errorMessage(error));
        this.submitting.set(false);
      }
    });
  }

  private loadLinks(): void {
    this.loading.set(true);
    this.listError.set('');

    this.linksApi.getLinks().subscribe({
      next: (links) => {
        this.links.set(links);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.listError.set(this.errorMessage(error));
        this.loading.set(false);
      }
    });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'Could not reach Snip. Check your connection and try again.';
      }

      const message = error.error?.error;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }

    return 'Something went wrong. Please try again.';
  }
}
