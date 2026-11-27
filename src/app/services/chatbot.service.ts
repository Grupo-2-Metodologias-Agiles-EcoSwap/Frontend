import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ChatbotTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatbotProduct {
  id: string;
  title: string;
  price: number | null;
  type: 'sale' | 'wanted';
  image: string | null;
}

export interface ChatbotResponse {
  reply: string;
  products: ChatbotProduct[];
}

@Injectable({
  providedIn: 'root'
})
export class ChatbotService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  ask(message: string, history: ChatbotTurn[]): Observable<ChatbotResponse> {
    return this.http.post<ChatbotResponse>(`${this.apiUrl}/chatbot`, { message, history });
  }
}
