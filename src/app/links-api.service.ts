import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface LinkRecord {
  code: string;
  url: string;
  shortUrl: string;
  hits: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class LinksApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:3000/api/links';

  getLinks(): Observable<LinkRecord[]> {
    return this.http.get<LinkRecord[]>(this.apiUrl);
  }

  createLink(url: string): Observable<LinkRecord> {
    return this.http.post<LinkRecord>(this.apiUrl, { url });
  }
}
