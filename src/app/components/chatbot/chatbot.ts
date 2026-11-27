import { Component, ElementRef, OnDestroy, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../services/auth';
import { ChatbotProduct, ChatbotService, ChatbotTurn } from '../../services/chatbot.service';

interface ChatbotMessage {
  role: 'user' | 'assistant';
  text: string;
  products?: ChatbotProduct[];
  isError?: boolean;
}

const STORAGE_KEY = 'ecobot-conversation';
const HISTORY_SIZE = 10;

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot.html',
})
export class Chatbot implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('messageInput') messageInput?: ElementRef<HTMLInputElement>;

  isLoggedIn = false;
  isHiddenRoute = false;
  isOpen = false;
  isSending = false;
  draft = '';
  messages: ChatbotMessage[] = [];

  readonly suggestions = [
    'Busco una calculadora científica',
    '¿Cómo publico un producto?',
    '¿Qué libros hay disponibles?',
    '¿Cómo funciona la reputación?',
  ];

  private subscriptions = new Subscription();

  constructor(
    private chatbotService: ChatbotService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.messages = this.loadConversation();

    this.subscriptions.add(
      this.authService.currentUser$.subscribe(user => {
        this.isLoggedIn = !!user;
        if (!user) {
          this.isOpen = false;
          this.messages = [];
          this.saveConversation();
        }
        this.cdr.detectChanges();
      })
    );

    this.updateRoute(this.router.url);
    this.subscriptions.add(
      this.router.events
        .pipe(filter(event => event instanceof NavigationEnd))
        .subscribe((event: any) => this.updateRoute(event.urlAfterRedirects))
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.cdr.detectChanges();
    if (this.isOpen) {
      this.scrollToBottom();
      setTimeout(() => this.messageInput?.nativeElement.focus(), 50);
    }
  }

  send(text: string = this.draft) {
    const message = text.trim();
    if (!message || this.isSending) return;

    const history: ChatbotTurn[] = this.messages
      .filter(m => !m.isError)
      .slice(-HISTORY_SIZE)
      .map(m => ({ role: m.role, text: m.text }));

    this.messages.push({ role: 'user', text: message });
    this.draft = '';
    this.isSending = true;
    this.saveConversation();
    this.cdr.detectChanges();
    this.scrollToBottom();

    this.chatbotService.ask(message, history).subscribe({
      next: (res) => {
        this.messages.push({ role: 'assistant', text: res.reply, products: res.products });
        this.finishSending();
      },
      error: (err) => {
        this.messages.push({
          role: 'assistant',
          text: err.error?.error || 'No pude responder en este momento. Intenta de nuevo.',
          isError: true,
        });
        this.finishSending();
      }
    });
  }

  openProduct(product: ChatbotProduct) {
    // Se cierra el panel para que no tape los botones de compra del detalle
    this.isOpen = false;
    this.router.navigate(['/product', product.id]);
  }

  clearConversation() {
    this.messages = [];
    this.saveConversation();
    this.cdr.detectChanges();
  }

  private finishSending() {
    this.isSending = false;
    this.saveConversation();
    this.cdr.detectChanges();
    this.scrollToBottom();
  }

  private updateRoute(url: string) {
    const path = url.split('?')[0];
    // En la pantalla de mensajes el botón flotante taparía el botón de enviar del chat
    this.isHiddenRoute = ['/login', '/register', '/chat'].includes(path);
    if (this.isHiddenRoute) this.isOpen = false;
    this.cdr.detectChanges();
  }

  private scrollToBottom() {
    setTimeout(() => {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }

  private loadConversation(): ChatbotMessage[] {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  private saveConversation() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.messages));
    } catch {
      // El almacenamiento es opcional: si falla, la conversación solo dura mientras la página esté abierta
    }
  }
}
